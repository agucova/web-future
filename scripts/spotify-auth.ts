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

interface Options {
	clientId: string;
	clientSecret: string;
	port: number;
	openBrowser: boolean;
}

/** Flags that take no value. */
const BOOLEAN_FLAGS = new Set(["no-open"]);

const USAGE = `Usage:
  bun run scripts/spotify-auth.ts --client-id <id> --client-secret <secret> [--port ${DEFAULT_PORT}] [--no-open]

Falls back to the SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET environment
variables when a flag is omitted. --no-open only prints the authorization
URL instead of opening a browser tab.`;

function parseArgs(argv: string[]): Options | { error: string } {
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

	const clientId = values.get("client-id") ?? process.env.SPOTIFY_CLIENT_ID ?? "";
	const clientSecret = values.get("client-secret") ?? process.env.SPOTIFY_CLIENT_SECRET ?? "";
	if (clientId.trim() === "" || clientSecret.trim() === "") {
		return { error: "Both --client-id and --client-secret are required." };
	}

	const rawPort = values.get("port");
	const port = rawPort === undefined ? DEFAULT_PORT : Number(rawPort);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		return { error: `Invalid --port value: ${rawPort}` };
	}

	return {
		clientId: clientId.trim(),
		clientSecret: clientSecret.trim(),
		port,
		openBrowser: values.get("no-open") !== "true",
	};
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
	const parsed = parseArgs(process.argv.slice(2));
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
