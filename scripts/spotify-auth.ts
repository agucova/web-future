#!/usr/bin/env bun
/**
 * One-time Spotify OAuth helper for the /api/now-playing endpoint.
 *
 *   bun run scripts/spotify-auth.ts --client-id <id> --client-secret <secret>
 *
 * Runs the authorization-code flow once against a local listener and prints
 * the resulting refresh token, which is the long-lived credential the Worker
 * needs. The Worker itself never does this: it only ever exchanges that
 * refresh token for short-lived access tokens.
 *
 * Full walkthrough (Spotify app creation, storing the secrets): see
 * docs/spotify-setup.md.
 */

const AUTHORIZE_ENDPOINT = "https://accounts.spotify.com/authorize";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";

/** Exactly what the Worker reads, and nothing else. */
const SCOPES = "user-read-currently-playing user-read-recently-played";

/**
 * Spotify rejects `localhost` redirect URIs but allows the loopback IP over
 * plain HTTP, so the registered redirect URI must match this exactly.
 */
const DEFAULT_PORT = 8888;
const CALLBACK_PATH = "/callback";

/** How long to wait for the browser round-trip before giving up. */
const TIMEOUT_MS = 5 * 60 * 1000;

/** Grace period so the confirmation page reaches the browser before shutdown. */
const RESPONSE_FLUSH_MS = 250;

/** 1Password field names inside the item passed to --op-item. */
const OP_VAULT = "Private";
const OP_CLIENT_ID_FIELD = "spotify_client_id";
const OP_CLIENT_SECRET_FIELD = "spotify_client_secret";
const OP_REFRESH_TOKEN_FIELD = "spotify_refresh_token";

interface Options {
	clientId: string;
	clientSecret: string;
	port: number;
	openBrowser: boolean;
	/** 1Password item id. When set, the refresh token is never printed. */
	opItem: string | null;
}

/** Everything the flags give us, before 1Password fills in the blanks. */
interface RawOptions {
	clientId: string;
	clientSecret: string;
	port: number;
	openBrowser: boolean;
	opItem: string | null;
}

/** Flags that take no value. */
const BOOLEAN_FLAGS = new Set(["no-open"]);

const USAGE = `Usage:
  bun run scripts/spotify-auth.ts --client-id <id> --client-secret <secret> [--port ${DEFAULT_PORT}] [--no-open]
  bun run scripts/spotify-auth.ts --op-item <item id> [--port ${DEFAULT_PORT}] [--no-open]

Falls back to the SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET environment
variables when a flag is omitted. --no-open only prints the authorization
URL instead of opening a browser tab.

--op-item reads the client id and secret from that 1Password item and writes
the refresh token straight back into it, so the token never reaches the
terminal.`;

function parseArgs(argv: string[]): RawOptions | { error: string } {
	const values = new Map<string, string>();

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === undefined || !arg.startsWith("--")) continue;

		const equals = arg.indexOf("=");
		if (equals !== -1) {
			values.set(arg.slice(2, equals), arg.slice(equals + 1));
			continue;
		}
		if (BOOLEAN_FLAGS.has(arg.slice(2))) {
			values.set(arg.slice(2), "true");
			continue;
		}
		const next = argv[i + 1];
		if (next === undefined || next.startsWith("--")) {
			return { error: `Missing value for ${arg}.` };
		}
		values.set(arg.slice(2), next);
		i++;
	}

	const rawPort = values.get("port");
	const port = rawPort === undefined ? DEFAULT_PORT : Number(rawPort);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		return { error: `Invalid --port value: ${rawPort}` };
	}

	return {
		clientId: (values.get("client-id") ?? process.env.SPOTIFY_CLIENT_ID ?? "").trim(),
		clientSecret: (values.get("client-secret") ?? process.env.SPOTIFY_CLIENT_SECRET ?? "").trim(),
		port,
		openBrowser: values.get("no-open") !== "true",
		opItem: values.get("op-item")?.trim() ?? null,
	};
}

/** Reads one secret out of 1Password without it passing through a shell. */
async function opRead(reference: string): Promise<string | null> {
	const proc = Bun.spawn(["op", "read", reference], { stdout: "pipe", stderr: "pipe" });
	const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
	if (code !== 0) return null;
	const value = stdout.trim();
	return value === "" ? null : value;
}

/**
 * Writes the refresh token into the 1Password item. The value is passed to
 * `op` through argv straight from memory, so it is never echoed, never
 * written to a file, and never lands in shell history. `op` echoes the edited
 * item back on stdout, so that output is discarded rather than shown.
 */
async function opStoreRefreshToken(item: string, refreshToken: string): Promise<string | null> {
	const proc = Bun.spawn(["op", "item", "edit", item, `${OP_REFRESH_TOKEN_FIELD}[concealed]=${refreshToken}`], {
		stdout: "ignore",
		stderr: "pipe",
	});
	const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
	if (code === 0) return null;
	return stderr.trim() === "" ? `op exited with code ${code}` : stderr.trim();
}

/** Fills any credential the flags did not supply from the 1Password item. */
async function resolveOptions(raw: RawOptions): Promise<Options | { error: string }> {
	let { clientId, clientSecret } = raw;

	if (raw.opItem !== null) {
		if (clientId === "") {
			clientId = (await opRead(`op://${OP_VAULT}/${raw.opItem}/${OP_CLIENT_ID_FIELD}`)) ?? "";
		}
		if (clientSecret === "") {
			clientSecret = (await opRead(`op://${OP_VAULT}/${raw.opItem}/${OP_CLIENT_SECRET_FIELD}`)) ?? "";
		}
		if (clientId === "" || clientSecret === "") {
			return {
				error: `Could not read ${OP_CLIENT_ID_FIELD} and ${OP_CLIENT_SECRET_FIELD} from 1Password item ${raw.opItem}.`,
			};
		}
	}

	if (clientId === "" || clientSecret === "") {
		return { error: "Both --client-id and --client-secret are required (or use --op-item)." };
	}

	return { clientId, clientSecret, port: raw.port, openBrowser: raw.openBrowser, opItem: raw.opItem };
}

function browserPage(title: string, detail: string): Response {
	const body = `<!doctype html>
<meta charset="utf-8">
<title>${title}</title>
<body style="font: 16px/1.5 system-ui, sans-serif; margin: 4rem auto; max-width: 32rem; padding: 0 1rem">
<h1 style="font-size: 1.25rem">${title}</h1>
<p>${detail}</p>
</body>`;
	return new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
}

/** Best effort: printing the URL is the real interface, opening it is a nicety. */
function openInBrowser(url: string): void {
	const opener =
		process.platform === "darwin"
			? ["open", url]
			: process.platform === "win32"
				? ["cmd", "/c", "start", "", url]
				: ["xdg-open", url];
	try {
		Bun.spawn(opener, { stdout: "ignore", stderr: "ignore" });
	} catch {
		// No browser opener available; the printed URL still works.
	}
}

/**
 * Serves the redirect URI once and resolves with the authorization code.
 * `stop` waits a moment before tearing the server down so the browser
 * actually receives the confirmation page.
 */
function awaitAuthorizationCode(port: number, state: string): { code: Promise<string>; stop: () => Promise<void> } {
	let settle: (code: string) => void = () => {};
	let fail: (reason: Error) => void = () => {};
	const code = new Promise<string>((resolve, reject) => {
		settle = resolve;
		fail = reject;
	});

	const server = Bun.serve({
		hostname: "127.0.0.1",
		port,
		fetch(request: Request): Response {
			const url = new URL(request.url);
			if (url.pathname !== CALLBACK_PATH) {
				return new Response("Not found", { status: 404 });
			}

			const denied = url.searchParams.get("error");
			if (denied !== null) {
				fail(new Error(`Spotify returned an error: ${denied}`));
				return browserPage("Authorization denied", "Nothing was stored. You can close this tab.");
			}

			if (url.searchParams.get("state") !== state) {
				fail(new Error("State mismatch: the callback did not come from this run."));
				return browserPage("State mismatch", "Nothing was stored. You can close this tab.");
			}

			const received = url.searchParams.get("code");
			if (received === null) {
				fail(new Error("Callback carried no authorization code."));
				return browserPage("Missing code", "Nothing was stored. You can close this tab.");
			}

			settle(received);
			return browserPage("Authorized", "You can close this tab and go back to the terminal.");
		},
	});

	const timer = setTimeout(() => fail(new Error("Timed out waiting for the Spotify callback.")), TIMEOUT_MS);

	return {
		code,
		stop: async () => {
			clearTimeout(timer);
			await Bun.sleep(RESPONSE_FLUSH_MS);
			server.stop(true);
		},
	};
}

async function exchangeCode(options: Options, code: string, redirectUri: string): Promise<string> {
	const response = await fetch(TOKEN_ENDPOINT, {
		method: "POST",
		headers: {
			authorization: `Basic ${btoa(`${options.clientId}:${options.clientSecret}`)}`,
			"content-type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: redirectUri,
		}).toString(),
	});

	const payload = (await response.json()) as { refresh_token?: unknown; error_description?: unknown; error?: unknown };
	if (!response.ok) {
		const reason = payload.error_description ?? payload.error ?? response.status;
		throw new Error(`Token exchange failed: ${String(reason)}`);
	}
	if (typeof payload.refresh_token !== "string" || payload.refresh_token === "") {
		throw new Error("Token exchange succeeded but carried no refresh token.");
	}
	return payload.refresh_token;
}

async function main(): Promise<void> {
	const raw = parseArgs(process.argv.slice(2));
	if ("error" in raw) {
		console.error(`${raw.error}\n\n${USAGE}`);
		process.exitCode = 1;
		return;
	}

	const parsed = await resolveOptions(raw);
	if ("error" in parsed) {
		console.error(`${parsed.error}\n\n${USAGE}`);
		process.exitCode = 1;
		return;
	}

	const redirectUri = `http://127.0.0.1:${parsed.port}${CALLBACK_PATH}`;
	const state = crypto.randomUUID();
	const authorizeUrl = `${AUTHORIZE_ENDPOINT}?${new URLSearchParams({
		response_type: "code",
		client_id: parsed.clientId,
		scope: SCOPES,
		redirect_uri: redirectUri,
		state,
	}).toString()}`;

	const listener = awaitAuthorizationCode(parsed.port, state);

	console.log(`Listening on ${redirectUri}`);
	console.log("Register that exact URI as a redirect URI on the Spotify app first.\n");
	console.log(
		parsed.openBrowser
			? "Opening the authorization page. If nothing opens, visit:\n"
			: "Open the authorization page:\n",
	);
	console.log(`${authorizeUrl}\n`);
	if (parsed.openBrowser) openInBrowser(authorizeUrl);

	let refreshToken: string;
	try {
		const code = await listener.code;
		refreshToken = await exchangeCode(parsed, code, redirectUri);
	} catch (error) {
		console.error(`\n${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
		return;
	} finally {
		await listener.stop();
	}

	if (parsed.opItem !== null) {
		const failure = await opStoreRefreshToken(parsed.opItem, refreshToken);
		if (failure !== null) {
			console.error(`\nCould not write the refresh token to 1Password: ${failure}`);
			process.exitCode = 1;
			return;
		}
		console.log("\nRefresh token stored in 1Password.");
		console.log("Next steps: docs/spotify-setup.md step 3.");
		return;
	}

	console.log("\nRefresh token (treat it like a password, it does not expire):\n");
	console.log(refreshToken);
	console.log(`
Store it, then hand it to the Worker:

  1. Save it in 1Password alongside the client id and secret, in the item
     already used by this site:

       op://Private/zba2amz2hrfsjc3zbfgq7776zq/spotify_client_id
       op://Private/zba2amz2hrfsjc3zbfgq7776zq/spotify_client_secret
       op://Private/zba2amz2hrfsjc3zbfgq7776zq/spotify_refresh_token

  2. Set the three Worker secrets (fish syntax, see DEPLOY.md for the
     cfwrangler credentials pattern):

       op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/spotify_client_id" | cfwrangler secret put SPOTIFY_CLIENT_ID
       op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/spotify_client_secret" | cfwrangler secret put SPOTIFY_CLIENT_SECRET
       op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/spotify_refresh_token" | cfwrangler secret put SPOTIFY_REFRESH_TOKEN

Full walkthrough: docs/spotify-setup.md`);
}

await main();
