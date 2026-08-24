/**
 * Reading the location back out of DNS, over DNS-over-HTTPS.
 *
 * This module is deliberately free of Worker and Node APIs: the browser runs
 * it too. DNS-over-HTTPS is ordinary HTTPS, and the public resolvers send
 * `access-control-allow-origin: *`, so a page can make its own DNS query with
 * `fetch` and never ask this site what the answer is. That matters here more
 * than it usually would. The whole premise of the feature is that the claim
 * lives in DNS rather than on a server, and a page that learns the claim from
 * its own origin has quietly reintroduced the middleman it was avoiding.
 *
 * What a browser cannot remove is the resolver. It is still a cache, still a
 * third party, and still able to answer with whatever it likes. Two defences,
 * in ascending order of strength:
 *
 *   - Ask several independent resolvers and show whether they agree. Not a
 *     proof, but it turns a silent lie into a visible disagreement, and it
 *     surfaces ordinary propagation instead of hiding it.
 *   - DNSSEC. `authenticated` below carries the AD bit, which is the
 *     resolver's claim to have validated the chain. Trusting that still
 *     trusts the resolver; validating the chain in the client would not.
 *     See docs/where-setup.md for why AD is currently false on agucova.dev.
 *
 * Every parse here fails towards silence. A resolver that is unreachable,
 * answers with a non-zero status, returns a shape this code does not fully
 * understand, or hands back a record type nobody asked for produces no
 * location at all rather than a guess.
 */
import { type City, cityById } from "./cities";
import {
	type Terms,
	TERMS_VERSION,
	cityForLoc,
	isCurrent,
	parseTerms,
} from "./index";
import {
	type LocRecord,
	formatLoc,
	parseLocAnswer,
	toDecimalDegrees,
} from "./loc";

/** A location is being published, and these are its terms. */
export interface WhereDisclosed {
	disclosed: true;
	/** Identifier in the city table, so callers can match without the label. */
	cityId: string;
	city: string;
	country: string;
	/** Degrees, rounded to whole arcminutes by the publisher. */
	latitude: number;
	longitude: number;
	/** RFC 1876 horizontal precision: the city diameter, not a GPS accuracy. */
	precisionMetres: number;
	since: string;
	until: string;
	/** The DNS name the records were read from. */
	name: string;
	/** The record as `dig` prints it, for comparing character by character. */
	loc: string;
}

/** Nothing is being published, for any reason. Reasons are not disclosed. */
export interface WhereSilent {
	disclosed: false;
}

export type WhereResponse = WhereDisclosed | WhereSilent;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const SILENT: WhereSilent = { disclosed: false };

export const DNS_TYPE_LOC = 29;
export const DNS_TYPE_TXT = 16;

export const REQUEST_TIMEOUT_MS = 5_000;

/**
 * A DNS-over-HTTPS endpoint speaking the JSON API.
 *
 * Both entries below set `access-control-allow-origin: *` and accept the
 * numeric query type, which matters: Google rejects the `LOC` mnemonic with a
 * 400 and only answers to `type=29`. Quad9 is absent on purpose. Its main
 * endpoint speaks RFC 8484 wire format only, and adding a wire-format
 * transport is worth doing alongside client-side DNSSEC validation rather
 * than on its own, since a third resolver that is merely trusted differently
 * buys very little.
 */
export interface DohResolver {
	readonly id: string;
	readonly label: string;
	readonly endpoint: string;
}

export const RESOLVERS: readonly DohResolver[] = [
	{ id: "cloudflare", label: "Cloudflare", endpoint: "https://cloudflare-dns.com/dns-query" },
	{ id: "google", label: "Google", endpoint: "https://dns.google/resolve" },
];

/** The resolver the Worker uses when nobody names one. */
export const DEFAULT_RESOLVER = RESOLVERS[0] as DohResolver;

// --- small helpers ----------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

/** One resolver's answer section for one question. */
export interface DnsAnswer {
	/** RDATA strings, in whatever presentation form the resolver chose. */
	readonly data: readonly string[];
	/** The AD bit: the resolver says it validated the DNSSEC chain. */
	readonly authenticated: boolean;
}

/**
 * The answers of `type` for `name`, from one resolver.
 *
 * Returns null on any doubt at all: a transport failure, a non-zero DNS
 * status, a malformed payload, or an answer carrying a different record type
 * than the one asked for. A caller that gets null publishes nothing.
 */
export async function resolveAnswers(
	name: string,
	type: number,
	doFetch: FetchLike,
	resolver: DohResolver = DEFAULT_RESOLVER,
): Promise<DnsAnswer | null> {
	try {
		const url = `${resolver.endpoint}?name=${encodeURIComponent(name)}&type=${type}`;
		const response = await doFetch(url, {
			headers: { accept: "application/dns-json" },
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		if (!response.ok) return null;

		const payload = asRecord(await response.json());
		if (payload === null || payload.Status !== 0) return null;

		const authenticated = payload.AD === true;

		// NOERROR with no answer section is a legitimate "no such record".
		const answers = payload.Answer;
		if (answers === undefined) return { data: [], authenticated };
		if (!Array.isArray(answers)) return null;

		const data: string[] = [];
		for (const answer of answers) {
			const entry = asRecord(answer);
			if (entry === null) return null;
			// Skip anything the resolver added while following the chain, but
			// only after establishing that it is a well-formed answer.
			if (entry.type !== type) continue;
			const value = asText(entry.data);
			if (value === null) return null;
			data.push(value);
		}
		return { data, authenticated };
	} catch {
		return null;
	}
}

/**
 * Unwraps one TXT answer.
 *
 * Resolvers do not agree on how to hand these back. Cloudflare returns the
 * quoted presentation form, and a value over 255 octets arrives as several
 * quoted strings that concatenate. Google returns the assembled value with no
 * quotes on it at all. Both spellings have to survive, or the second resolver
 * reads as "nothing published" and every lookup looks like a disagreement.
 *
 * A string carrying a quote that does not form a complete segment is a shape
 * this code does not understand, and gets the usual treatment: nothing.
 */
export function unquoteTxt(data: string): string | null {
	const trimmed = data.trim();
	if (trimmed === "") return null;

	const segments = [...trimmed.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) =>
		(match[1] as string).replace(/\\(.)/g, "$1"),
	);
	if (segments.length > 0) return segments.join("");

	return trimmed.includes('"') ? null : trimmed;
}

/**
 * The terms among a name's TXT records.
 *
 * The apex carries several unrelated TXT records, so this picks out the one
 * with the format's own prefix. Two of them is an ambiguity nobody should
 * resolve by guessing, so it counts as no terms at all.
 */
export function selectTerms(answers: readonly string[]): Terms | null {
	let found: Terms | null = null;
	for (const answer of answers) {
		const value = unquoteTxt(answer);
		if (value === null || !value.startsWith(TERMS_VERSION)) continue;
		if (found !== null) return null;
		const parsed = parseTerms(value);
		if (parsed === null) return null;
		found = parsed;
	}
	return found;
}

/** The single LOC record at a name, if there is exactly one and it parses. */
export function selectLoc(answers: readonly string[]): LocRecord | null {
	if (answers.length !== 1) return null;
	return parseLocAnswer(answers[0] as string);
}

/** Assembles the response from a matched city and current terms. */
export function shape(city: City, record: LocRecord, terms: Terms, name: string): WhereDisclosed {
	return {
		disclosed: true,
		cityId: city.id,
		city: city.name,
		country: city.country,
		latitude: toDecimalDegrees(record.latitude),
		longitude: toDecimalDegrees(record.longitude),
		precisionMetres: record.horizontalPrecisionMetres,
		since: terms.since,
		until: terms.until,
		name,
		loc: formatLoc(record),
	};
}

/**
 * Resolves both records through one resolver and turns them into a response.
 *
 * Every step is a gate, and every gate fails towards silence: both records
 * must resolve, the LOC record must be the only one and must parse, the terms
 * must be the only ones and must parse, the terms must not have expired, and
 * the coordinates must match a city in the table.
 */
export async function resolveFromDns(
	name: string,
	doFetch: FetchLike,
	now: number,
	resolver: DohResolver = DEFAULT_RESOLVER,
): Promise<WhereResponse> {
	const [loc, txt] = await Promise.all([
		resolveAnswers(name, DNS_TYPE_LOC, doFetch, resolver),
		resolveAnswers(name, DNS_TYPE_TXT, doFetch, resolver),
	]);
	if (loc === null || txt === null) return SILENT;

	const record = selectLoc(loc.data);
	if (record === null) return SILENT;

	const terms = selectTerms(txt.data);
	if (terms === null || !isCurrent(terms, now)) return SILENT;

	const city = cityForLoc(record);
	if (city === null) return SILENT;

	return shape(city, record, terms, name);
}

// --- asking more than one resolver -----------------------------------------

/** What one resolver had to say. */
export interface ResolverOutcome {
	readonly resolver: DohResolver;
	/** Null when the resolver could not be used at all. */
	readonly response: WhereResponse | null;
	/** Whether that resolver claimed a validated DNSSEC chain for the LOC. */
	readonly authenticated: boolean;
}

/** What a set of resolvers collectively support saying. */
export interface Consensus {
	readonly outcomes: readonly ResolverOutcome[];
	/** The answer, present only when every usable resolver produced the same one. */
	readonly answer: WhereResponse | null;
	/** How many resolvers answered at all. */
	readonly usable: number;
	/** True when at least one resolver answered and none of them disagreed. */
	readonly agreed: boolean;
	/** True when every usable resolver reported a validated DNSSEC chain. */
	readonly authenticated: boolean;
}

/** Canonical form of a response, for comparing two resolvers' answers. */
function fingerprint(response: WhereResponse): string {
	if (!response.disclosed) return "silent";
	// Key on the record and its terms, not on the rendered city name, so a
	// stale city table on one side cannot masquerade as a DNS disagreement.
	return [response.name, response.loc, response.since, response.until].join("|");
}

/**
 * Asks every resolver the same question, in parallel, and reports whether
 * they agreed.
 *
 * Disagreement is reported rather than resolved. Picking a winner would be
 * inventing an authority that does not exist, and the interesting case for a
 * reader is precisely that two resolvers are saying different things.
 */
export async function resolveAcross(
	name: string,
	doFetch: FetchLike,
	now: number,
	resolvers: readonly DohResolver[] = RESOLVERS,
): Promise<Consensus> {
	const outcomes = await Promise.all(
		resolvers.map(async (resolver): Promise<ResolverOutcome> => {
			const [loc, txt] = await Promise.all([
				resolveAnswers(name, DNS_TYPE_LOC, doFetch, resolver),
				resolveAnswers(name, DNS_TYPE_TXT, doFetch, resolver),
			]);
			if (loc === null || txt === null) {
				return { resolver, response: null, authenticated: false };
			}

			const record = selectLoc(loc.data);
			const terms = record === null ? null : selectTerms(txt.data);
			const city = record === null ? null : cityForLoc(record);
			const response =
				record === null || terms === null || city === null || !isCurrent(terms, now)
					? SILENT
					: shape(city, record, terms, name);

			return { resolver, response, authenticated: loc.authenticated && txt.authenticated };
		}),
	);

	const answered = outcomes.filter((outcome) => outcome.response !== null);
	const prints = new Set(answered.map((outcome) => fingerprint(outcome.response as WhereResponse)));
	const agreed = answered.length > 0 && prints.size === 1;

	return {
		outcomes,
		answer: agreed ? (answered[0] as ResolverOutcome).response : null,
		usable: answered.length,
		agreed,
		authenticated: answered.length > 0 && answered.every((outcome) => outcome.authenticated),
	};
}

/** Re-exported so callers touching a response can name a city without a second import. */
export { cityById };
