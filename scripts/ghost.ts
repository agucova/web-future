#!/usr/bin/env bun
/**
 * Ghost mode switch for GET /api/now-playing.
 *
 *   bun run scripts/ghost.ts on      # stop reporting activity
 *   bun run scripts/ghost.ts off     # resume
 *   bun run scripts/ghost.ts status  # check
 *
 * Add --local to drive the local KV simulation that `wrangler dev` uses
 * instead of the deployed namespace, for trying the switch out offline.
 *
 * While ghost mode is on the Worker makes no Spotify calls at all and serves
 * the last track it saw before the switch, with that track's real timestamp.
 * The entry then ages on its own, so from outside the endpoint looks exactly
 * like someone who stopped listening after that song. Turning it on is
 * therefore not observable, which is the whole point.
 *
 * Switching on also purges the response cache, so a live answer captured
 * seconds earlier cannot outlive the flag.
 *
 * Credentials come from 1Password, never from `wrangler login`: the OAuth
 * credentials on this machine belong to a different account (see DEPLOY.md).
 */

const NAMESPACE_ID = "9cc79d836a0d48dd945e49e8f805acd6";
const ACCOUNT_ID = "d2fe37c02a1d31f3239f9c30c8907db7";
const API_TOKEN_REFERENCE = "op://Private/zba2amz2hrfsjc3zbfgq7776zq/api_token";

const GHOST_KEY = "ghost:v1";
const RESPONSE_KEY = "response:v1";
const GHOST_ON = "on";

const USAGE = `Usage:
  bun run scripts/ghost.ts on|off|status [--local]

--local drives the KV simulation used by \`wrangler dev\` instead of the
deployed namespace.`;

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

/** Reads the Cloudflare API token, which is then passed only via the environment. */
async function readApiToken(): Promise<string> {
	const result = await run(["op", "read", API_TOKEN_REFERENCE]);
	const token = result.stdout.trim();
	if (result.code !== 0 || token === "") {
		throw new Error(`Could not read the Cloudflare API token from 1Password: ${result.stderr.trim()}`);
	}
	return token;
}

function wranglerEnv(apiToken: string): Record<string, string> {
	return { CLOUDFLARE_API_TOKEN: apiToken, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID };
}

async function kv(args: string[], apiToken: string, local: boolean): Promise<CommandResult> {
	const target = local ? ["--local"] : ["--remote"];
	return run(
		["bunx", "wrangler", "kv", ...args, "--namespace-id", NAMESPACE_ID, ...target],
		wranglerEnv(apiToken),
	);
}

async function readFlag(apiToken: string, local: boolean): Promise<boolean> {
	const result = await kv(["key", "get", GHOST_KEY, "--text"], apiToken, local);
	// A missing key exits non-zero, which is simply "ghost mode is off".
	return result.code === 0 && result.stdout.trim() === GHOST_ON;
}

/** Drops the cached response so the switch takes effect on the next request. */
async function purgeResponseCache(apiToken: string, local: boolean): Promise<void> {
	const result = await kv(["key", "delete", RESPONSE_KEY], apiToken, local);
	// Deleting an absent key is not a failure worth reporting.
	if (result.code !== 0 && !result.stderr.toLowerCase().includes("not found")) {
		throw new Error(`Could not purge ${RESPONSE_KEY}: ${result.stderr.trim()}`);
	}
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const local = args.includes("--local");
	const command = args.find((arg) => !arg.startsWith("--"));
	if (command !== "on" && command !== "off" && command !== "status") {
		console.error(`${command === undefined ? "Missing command." : `Unknown command: ${command}`}\n\n${USAGE}`);
		process.exitCode = 1;
		return;
	}

	// The local simulation needs no credentials, but reading them anyway keeps
	// one code path and catches a broken 1Password setup before it matters.
	const apiToken = await readApiToken();

	const where = local ? " (local)" : "";

	if (command === "status") {
		const on = await readFlag(apiToken, local);
		console.log(
			on
				? `Ghost mode is ON${where}: /api/now-playing reports the last track seen before it was switched on.`
				: `Ghost mode is OFF${where}: /api/now-playing reports live activity.`,
		);
		return;
	}

	if (command === "on") {
		const result = await kv(["key", "put", GHOST_KEY, GHOST_ON], apiToken, local);
		if (result.code !== 0) {
			throw new Error(`Could not set ${GHOST_KEY}: ${result.stderr.trim()}`);
		}
		await purgeResponseCache(apiToken, local);
		console.log(
			`Ghost mode is ON${where}. No Spotify calls are made; the last track seen is served with its real timestamp and ages naturally.`,
		);
		return;
	}

	const result = await kv(["key", "delete", GHOST_KEY], apiToken, local);
	if (result.code !== 0 && !result.stderr.toLowerCase().includes("not found")) {
		throw new Error(`Could not clear ${GHOST_KEY}: ${result.stderr.trim()}`);
	}
	await purgeResponseCache(apiToken, local);
	console.log(`Ghost mode is OFF${where}. Live reporting resumes on the next request.`);
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
