#!/usr/bin/env bun
/**
 * The where-am-I switch: publishes which city Agus is in, or takes it down.
 *
 *   bun run scripts/where.ts set berkeley       # publish, for 14 days
 *   bun run scripts/where.ts set london --days 5
 *   bun run scripts/where.ts clear              # stop publishing
 *   bun run scripts/where.ts status             # what is published right now
 *   bun run scripts/where.ts cities             # the ids `set` accepts
 *
 * A sibling of scripts/ghost.ts, with the opposite default: ghost mode is
 * opt-out, this is opt-in. Nothing is published until `set` runs, and `clear`
 * puts it back to nothing.
 *
 * What `set` does, in this order:
 *
 *   1. writes the LOC record  (the place, coarsened to city scale)
 *   2. writes the TXT record  (`v=where1; since=...; until=...`)
 *   3. sets the `disclose:v1` flag in the WHERE namespace
 *   4. drops the Worker's cached answer
 *
 * `clear` runs the reverse: flag first, then the cache, then TXT, then LOC.
 * Both orders are chosen so that every partial state is a non-disclosing one.
 * If step 2 of `set` fails there is a LOC record with no terms, which the site
 * refuses to publish; if step 4 of `clear` fails there is a LOC record with no
 * terms again, same result.
 *
 * The city comes from src/lib/where/cities.ts and nowhere else, so the
 * coordinates that reach DNS are ones that were reviewed in a pull request
 * rather than typed at a prompt.
 *
 * Deliberately absent: any way to record that a published location is
 * inaccurate. The site's policy is that it may be wrong or stale on purpose,
 * stated permanently on /where. A per-trip marker would defeat that by
 * pointing at exactly the trips it exists to cover, so setting a city you are
 * not in is just `set <that city>` and leaves no trace anywhere.
 *
 * Credentials come from the environment or 1Password, never from
 * `wrangler login`: the OAuth credentials on this machine belong to a
 * different account (see DEPLOY.md).
 */
import {
	DEFAULT_DAYS,
	MAX_DAYS,
	MIN_DAYS,
	RECORD_TTL_SECONDS,
	TERMS_VERSION,
	WHERE_NAME,
	cityForLoc,
	formatTerms,
	isCurrent,
	locFor,
	parseTerms,
	utcDate,
} from "../src/lib/where/index";
import { CITIES, type City, cityById } from "../src/lib/where/cities";
import { formatLoc, parseLocAnswer, toCloudflareLocData } from "../src/lib/where/loc";

/** The zone every record lives on. `--name` can only add a label under it. */
const ZONE = WHERE_NAME;

const NAMESPACE_ID = "5b823210670b45859e1295ca5c221faf";
const ACCOUNT_ID = "d2fe37c02a1d31f3239f9c30c8907db7";
const API_TOKEN_REFERENCE = "op://Private/zba2amz2hrfsjc3zbfgq7776zq/api_token";

const DISCLOSE_KEY = "disclose:v1";
const DISCLOSE_ON = "on";
const CACHE_KEY = "answer:v1";

const API_ROOT = "https://api.cloudflare.com/client/v4";
const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";

const RECORD_COMMENT = "where-am-I, written by scripts/where.ts";

const USAGE = `Usage:
  bun run scripts/where.ts set <city> [--days N] [--name LABEL] [--local]
  bun run scripts/where.ts clear [--name LABEL] [--local]
  bun run scripts/where.ts status [--name LABEL] [--local]
  bun run scripts/where.ts cities

  --days N      how long to claim the location for (${MIN_DAYS}..${MAX_DAYS}, default ${DEFAULT_DAYS})
  --name LABEL  publish at LABEL.${ZONE} instead of the apex, for testing
  --local       drive the KV simulation \`wrangler dev\` uses instead of the
                deployed namespace. DNS is still the real thing, since there
                is no local DNS; combine with --name for an end-to-end test.`;

// --- shelling out -----------------------------------------------------------

interface CommandResult {
	code: number;
	stdout: string;
	stderr: string;
}

async function run(command: string[], env?: Record<string, string>): Promise<CommandResult> {
	const proc = Bun.spawn(command, {
		stdout: "pipe",
		stderr: "pipe",
		env: env === undefined ? process.env : { ...process.env, ...env },
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { code, stdout, stderr };
}

/**
 * The Cloudflare API token, from the environment if the secrets loader has
 * put it there, otherwise from 1Password. It is only ever passed onwards
 * through an Authorization header or the child process environment.
 */
async function readApiToken(): Promise<string> {
	const fromEnv = process.env.CLOUDFLARE_API_TOKEN ?? process.env.CLOUDFLARE_PERSONAL_API_TOKEN;
	if (fromEnv !== undefined && fromEnv.trim() !== "") return fromEnv.trim();

	const result = await run(["op", "read", API_TOKEN_REFERENCE]);
	const token = result.stdout.trim();
	if (result.code !== 0 || token === "") {
		throw new Error(`Could not read the Cloudflare API token from 1Password: ${result.stderr.trim()}`);
	}
	return token;
}

// --- the Cloudflare API -----------------------------------------------------

interface ApiResponse<T> {
	success: boolean;
	errors: { code: number; message: string }[];
	result: T;
}

async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
	const response = await fetch(`${API_ROOT}${path}`, {
		...init,
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
			...(init.headers ?? {}),
		},
	});
	const payload = (await response.json()) as ApiResponse<T>;
	if (!payload.success) {
		const detail = (payload.errors ?? []).map((error) => `${error.code} ${error.message}`).join("; ");
		// 9109 and 10000 are what a token without Zone:DNS:Edit comes back
		// with, which is worth naming rather than leaving as a bare code.
		const hint = /\b(9109|10000|authentication|permission)/i.test(detail)
			? `\nThe token may be missing Zone > DNS > Edit on the ${ZONE} zone.`
			: "";
		throw new Error(`Cloudflare API ${path} failed: ${detail}${hint}`);
	}
	return payload.result;
}

interface DnsRecord {
	id: string;
	type: string;
	name: string;
	content: string;
}

let zoneIdCache: string | null = null;

async function zoneId(token: string): Promise<string> {
	if (zoneIdCache !== null) return zoneIdCache;
	const zones = await api<{ id: string; name: string }[]>(token, `/zones?name=${encodeURIComponent(ZONE)}`);
	const zone = zones.find((candidate) => candidate.name === ZONE);
	if (zone === undefined) throw new Error(`No zone named ${ZONE} on this account.`);
	zoneIdCache = zone.id;
	return zone.id;
}

async function listRecords(token: string, type: string, fqdn: string): Promise<DnsRecord[]> {
	const zone = await zoneId(token);
	return api<DnsRecord[]>(
		token,
		`/zones/${zone}/dns_records?type=${type}&name=${encodeURIComponent(fqdn)}&per_page=100`,
	);
}

async function putRecord(token: string, existing: DnsRecord | undefined, body: unknown): Promise<void> {
	const zone = await zoneId(token);
	if (existing === undefined) {
		await api(token, `/zones/${zone}/dns_records`, { method: "POST", body: JSON.stringify(body) });
	} else {
		await api(token, `/zones/${zone}/dns_records/${existing.id}`, {
			method: "PUT",
			body: JSON.stringify(body),
		});
	}
}

async function deleteRecord(token: string, record: DnsRecord): Promise<void> {
	const zone = await zoneId(token);
	await api(token, `/zones/${zone}/dns_records/${record.id}`, { method: "DELETE" });
}

/**
 * The TXT records at a name that belong to this feature.
 *
 * The apex already carries unrelated TXT records (Ariadne, Keybase, mail),
 * and none of them may ever be touched, so everything here filters on the
 * format's own prefix rather than on the name alone.
 */
function ownTxt(records: DnsRecord[]): DnsRecord[] {
	return records.filter((record) => record.content.replace(/^"|"$/g, "").startsWith(TERMS_VERSION));
}

// --- KV, through wrangler ---------------------------------------------------

async function kv(args: string[], token: string, local: boolean): Promise<CommandResult> {
	return run(["bunx", "wrangler", "kv", ...args, "--namespace-id", NAMESPACE_ID, local ? "--local" : "--remote"], {
		CLOUDFLARE_API_TOKEN: token,
		CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
	});
}

async function readFlag(token: string, local: boolean): Promise<boolean> {
	const result = await kv(["key", "get", DISCLOSE_KEY, "--text"], token, local);
	// A missing key exits non-zero, which is simply "not disclosing".
	return result.code === 0 && result.stdout.trim() === DISCLOSE_ON;
}

async function setFlag(token: string, local: boolean): Promise<void> {
	const result = await kv(["key", "put", DISCLOSE_KEY, DISCLOSE_ON], token, local);
	if (result.code !== 0) throw new Error(`Could not set ${DISCLOSE_KEY}: ${result.stderr.trim()}`);
}

async function clearFlag(token: string, local: boolean): Promise<void> {
	const result = await kv(["key", "delete", DISCLOSE_KEY], token, local);
	if (result.code !== 0 && !result.stderr.toLowerCase().includes("not found")) {
		throw new Error(`Could not clear ${DISCLOSE_KEY}: ${result.stderr.trim()}`);
	}
}

/** Drops the Worker's cached answer so a change lands on the next request. */
async function purgeCache(token: string, local: boolean): Promise<void> {
	const result = await kv(["key", "delete", CACHE_KEY], token, local);
	if (result.code !== 0 && !result.stderr.toLowerCase().includes("not found")) {
		throw new Error(`Could not purge ${CACHE_KEY}: ${result.stderr.trim()}`);
	}
}

// --- reading the published answer back --------------------------------------

interface DohAnswer {
	type: number;
	data: string;
}

async function resolveDoh(fqdn: string, type: string): Promise<DohAnswer[]> {
	const response = await fetch(`${DOH_ENDPOINT}?name=${encodeURIComponent(fqdn)}&type=${type}`, {
		headers: { accept: "application/dns-json" },
	});
	if (!response.ok) throw new Error(`DNS lookup for ${type} ${fqdn} failed: HTTP ${response.status}`);
	const payload = (await response.json()) as { Status: number; Answer?: DohAnswer[] };
	if (payload.Status !== 0) throw new Error(`DNS lookup for ${type} ${fqdn} failed: status ${payload.Status}`);
	return payload.Answer ?? [];
}

// --- commands ---------------------------------------------------------------

function fqdnFor(label: string | null): string {
	return label === null ? ZONE : `${label}.${ZONE}`;
}

async function commandSet(city: City, days: number, label: string | null, token: string, local: boolean): Promise<void> {
	const fqdn = fqdnFor(label);
	const record = locFor(city);
	const now = new Date();
	const terms = { since: utcDate(now), until: utcDate(now, days) };

	// Both preconditions are checked before either record is written, so an
	// ambiguity found halfway through cannot leave a half-published state.
	const existingLoc = await listRecords(token, "LOC", fqdn);
	const existingTxt = ownTxt(await listRecords(token, "TXT", fqdn));
	if (existingLoc.length > 1) {
		throw new Error(`${fqdn} already has ${existingLoc.length} LOC records. Sort that out by hand first.`);
	}
	if (existingTxt.length > 1) {
		throw new Error(
			`${fqdn} already has ${existingTxt.length} ${TERMS_VERSION} TXT records. Sort that out by hand first.`,
		);
	}

	await putRecord(token, existingLoc[0], {
		type: "LOC",
		name: fqdn,
		ttl: RECORD_TTL_SECONDS,
		comment: RECORD_COMMENT,
		data: toCloudflareLocData(record),
	});
	await putRecord(token, existingTxt[0], {
		type: "TXT",
		name: fqdn,
		ttl: RECORD_TTL_SECONDS,
		comment: RECORD_COMMENT,
		content: formatTerms(terms),
	});

	await setFlag(token, local);
	await purgeCache(token, local);

	console.log(
		[
			`Published ${city.name}, ${city.country} at ${fqdn}${local ? " (KV flag set locally)" : ""}.`,
			`Claimed from ${terms.since} until the end of ${terms.until}; after that the site goes quiet on its own.`,
			"",
			`  dig +short LOC ${fqdn}`,
			`  ${formatLoc(record)}`,
			"",
			`  dig +short TXT ${fqdn}`,
			`  "${formatTerms(terms)}"`,
			"",
			`Records may take up to ${RECORD_TTL_SECONDS}s to be visible through a resolver that already cached a negative answer.`,
		].join("\n"),
	);
}

async function commandClear(label: string | null, token: string, local: boolean): Promise<void> {
	const fqdn = fqdnFor(label);

	// The flag first: that silences the site immediately, before the slower
	// DNS deletions and regardless of whether they succeed.
	await clearFlag(token, local);
	await purgeCache(token, local);

	for (const record of ownTxt(await listRecords(token, "TXT", fqdn))) {
		await deleteRecord(token, record);
	}
	for (const record of await listRecords(token, "LOC", fqdn)) {
		await deleteRecord(token, record);
	}

	console.log(
		[
			`Cleared ${fqdn}${local ? " (KV flag cleared locally)" : ""}: the flag is off and both records are gone.`,
			`Resolvers may keep answering for up to ${RECORD_TTL_SECONDS}s, but the site is already quiet.`,
		].join("\n"),
	);
}

async function commandStatus(label: string | null, token: string, local: boolean): Promise<void> {
	const fqdn = fqdnFor(label);
	const where = local ? " (local)" : "";

	const disclosing = await readFlag(token, local);
	console.log(
		disclosing
			? `Flag${where}: ON. The site publishes whatever DNS says.`
			: `Flag${where}: OFF. The site publishes nothing, whatever DNS says.`,
	);

	const locAnswers = (await resolveDoh(fqdn, "LOC")).filter((answer) => answer.type === 29);
	const txtAnswers = (await resolveDoh(fqdn, "TXT")).filter((answer) => answer.type === 16);

	if (locAnswers.length === 0) {
		console.log(`DNS: no LOC record on ${fqdn}.`);
		return;
	}
	if (locAnswers.length > 1) {
		console.log(`DNS: ${locAnswers.length} LOC records on ${fqdn}, which the site refuses to read.`);
		return;
	}

	const record = parseLocAnswer(locAnswers[0]?.data ?? "");
	if (record === null) {
		console.log(`DNS: the LOC record on ${fqdn} did not parse, which the site reads as nothing.`);
		return;
	}
	const city = cityForLoc(record);
	console.log(`DNS: ${fqdn}. IN LOC ${formatLoc(record)}`);
	console.log(`     ${city === null ? "no city in the table matches these coordinates" : `${city.name}, ${city.country}`}`);

	const termsRecords = txtAnswers
		.map((answer) => answer.data.replace(/^"|"$/g, ""))
		.filter((value) => value.startsWith(TERMS_VERSION));
	if (termsRecords.length !== 1) {
		console.log(`     ${termsRecords.length} terms records, so the site publishes nothing.`);
		return;
	}
	const terms = parseTerms(termsRecords[0] as string);
	if (terms === null) {
		console.log("     the terms record did not parse, so the site publishes nothing.");
		return;
	}
	const current = isCurrent(terms, Date.now());
	console.log(`     since ${terms.since}, until the end of ${terms.until} (${current ? "current" : "EXPIRED"})`);

	const visible = disclosing && city !== null && current;
	console.log(`Site: ${visible ? `showing ${city?.name}` : "showing nothing"}.`);
}

function commandCities(): void {
	console.log("id                name                country            published as");
	for (const city of CITIES) {
		console.log(
			`${city.id.padEnd(18)}${city.name.padEnd(20)}${city.country.padEnd(19)}${formatLoc(locFor(city))}`,
		);
	}
}

// --- entry point ------------------------------------------------------------

function readOption(args: string[], flag: string): string | null {
	const index = args.indexOf(flag);
	if (index < 0) return null;
	const value = args[index + 1];
	if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value.\n\n${USAGE}`);
	return value;
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const local = args.includes("--local");
	const label = readOption(args, "--name");
	const rawDays = readOption(args, "--days");

	const positional = args.filter((arg, index) => {
		if (arg.startsWith("--")) return false;
		const previous = args[index - 1];
		return previous !== "--name" && previous !== "--days";
	});
	const command = positional[0];

	if (command === "cities") {
		commandCities();
		return;
	}
	if (command !== "set" && command !== "clear" && command !== "status") {
		console.error(`${command === undefined ? "Missing command." : `Unknown command: ${command}`}\n\n${USAGE}`);
		process.exitCode = 1;
		return;
	}

	let city: City | null = null;
	let days = DEFAULT_DAYS;
	if (command === "set") {
		const id = positional[1];
		if (id === undefined) throw new Error(`\`set\` needs a city id. Try \`cities\`.\n\n${USAGE}`);
		city = cityById(id);
		if (city === null) {
			throw new Error(`Unknown city: ${id}. Known ids: ${CITIES.map((entry) => entry.id).join(", ")}.`);
		}
		if (rawDays !== null) {
			days = Number.parseInt(rawDays, 10);
			if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS) {
				throw new Error(`--days must be a whole number between ${MIN_DAYS} and ${MAX_DAYS}.`);
			}
		}
	}

	const token = await readApiToken();

	if (command === "set") return commandSet(city as City, days, label, token, local);
	if (command === "clear") return commandClear(label, token, local);
	return commandStatus(label, token, local);
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
