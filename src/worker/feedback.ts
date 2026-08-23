/**
 * Anonymous feedback endpoint (POST /api/feedback).
 *
 * Accepts an age-encrypted (armored) message from the /feedback form,
 * verifies a Turnstile token, and forwards the ciphertext by email.
 *
 * Privacy invariants — every change to this file must preserve them:
 *   - This endpoint only ever handles ciphertext. Anything that is not a
 *     well-formed armored age message is rejected before further processing.
 *   - Nothing is persisted anywhere: no KV, no D1, no queues, no caches.
 *   - Nothing is logged: no console.* calls, and observability is disabled
 *     in wrangler.jsonc.
 *   - The client IP is never read, never forwarded to Turnstile's siteverify
 *     (the `remoteip` parameter is deliberately omitted), and never appears
 *     in the outgoing email.
 *   - The email subject only carries a coarse YYYY-MM date, so the inbox
 *     doesn't accumulate precise submission timestamps.
 */
import type { Env } from "./env";

type FeedbackEnv = Pick<Env, "EMAIL" | "TURNSTILE_SECRET">;

/** Hard cap on the request body. Armored feedback is well under this. */
const MAX_BODY_BYTES = 32 * 1024;

const ARMOR_HEADER = "-----BEGIN AGE ENCRYPTED FILE-----";
const ARMOR_FOOTER = "-----END AGE ENCRYPTED FILE-----";

/** Base64 (standard alphabet, optional padding), as used by age armor. */
const BASE64_LINE = /^[A-Za-z0-9+/]+={0,2}$/;

const FEEDBACK_TO = "agucova@gmail.com";
const FEEDBACK_FROM = { email: "feedback@agucova.dev", name: "Anonymous Feedback" };

interface FeedbackPayload {
	ciphertext?: unknown;
	turnstileToken?: unknown;
	/** Honeypot field: real submissions always send it empty. */
	website?: unknown;
}

interface SiteverifyResult {
	success?: boolean;
}

function jsonError(status: number, message: string, extraHeaders?: Record<string, string>): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: {
			"content-type": "application/json",
			"cache-control": "no-store",
			...extraHeaders,
		},
	});
}

/**
 * Strictly validates that a string is an ASCII-armored age message: header
 * line, base64 body lines (64 chars each, shorter final line), footer line.
 * This is what guarantees the endpoint never relays plaintext — anything
 * that doesn't parse as armor is rejected.
 */
export function isArmoredAgeMessage(input: string): boolean {
	const lines = input.trim().split(/\r?\n/);
	if (lines.length < 3) return false;
	if (lines[0] !== ARMOR_HEADER) return false;
	if (lines[lines.length - 1] !== ARMOR_FOOTER) return false;

	const body = lines.slice(1, -1);
	if (body.length === 0) return false;
	for (let i = 0; i < body.length; i++) {
		const line = body[i];
		if (line === undefined || line.length === 0 || line.length > 64) return false;
		// All lines except the last must be exactly 64 characters.
		if (i < body.length - 1 && line.length !== 64) return false;
		if (!BASE64_LINE.test(line)) return false;
	}
	return true;
}

/**
 * Reads the request body, enforcing the size cap while streaming so an
 * oversized (or Content-Length-less) body can't be buffered in full.
 * Returns null if the cap is exceeded.
 */
async function readBodyCapped(request: Request, cap: number): Promise<string | null> {
	const declared = request.headers.get("content-length");
	if (declared !== null && Number(declared) > cap) return null;

	const body = request.body;
	if (body === null) return "";

	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > cap) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}

	const joined = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		joined.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(joined);
}

async function verifyTurnstile(secret: string, token: string): Promise<boolean> {
	// `remoteip` is deliberately not sent: the sender's IP must never leave
	// this request's context, not even towards Turnstile.
	const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
		method: "POST",
		body: new URLSearchParams({ secret, response: token }),
	});
	if (!response.ok) return false;
	const outcome = (await response.json()) as SiteverifyResult;
	return outcome.success === true;
}

async function handlePost(request: Request, env: FeedbackEnv): Promise<Response> {
	const rawBody = await readBodyCapped(request, MAX_BODY_BYTES);
	if (rawBody === null) {
		return jsonError(413, "Request body too large.");
	}

	let payload: FeedbackPayload;
	try {
		payload = JSON.parse(rawBody) as FeedbackPayload;
	} catch {
		return jsonError(400, "Body must be valid JSON.");
	}

	// Honeypot: the hidden "website" field must be empty. Bots that fill it
	// get a silent success so they don't learn they were caught.
	if (typeof payload.website === "string" && payload.website !== "") {
		return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
	}

	const { ciphertext, turnstileToken } = payload;
	if (typeof ciphertext !== "string" || typeof turnstileToken !== "string") {
		return jsonError(400, "Expected JSON with string fields ciphertext and turnstileToken.");
	}

	if (!isArmoredAgeMessage(ciphertext)) {
		return jsonError(400, "ciphertext must be an ASCII-armored age message.");
	}

	if (!(await verifyTurnstile(env.TURNSTILE_SECRET, turnstileToken))) {
		return jsonError(403, "Human verification failed. Please try again.");
	}

	// Coarse date only (YYYY-MM): a precise timestamp in the subject would
	// undermine sender anonymity by pinpointing when they submitted.
	const now = new Date();
	const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

	try {
		await env.EMAIL.send({
			to: FEEDBACK_TO,
			from: FEEDBACK_FROM,
			subject: `Anonymous feedback (${month})`,
			text: `${ciphertext.trim()}\n\nDecrypt with: age -d -i <keyfile>\n`,
		});
	} catch {
		// Intentionally not logged (see privacy invariants above).
		return jsonError(502, "Could not deliver the message. Please try again later.");
	}

	return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

export async function handleFeedbackRequest(request: Request, env: FeedbackEnv): Promise<Response> {
	switch (request.method) {
		case "POST":
			return handlePost(request, env);
		case "OPTIONS":
			// Same-origin API: no CORS headers on purpose. Cross-origin
			// preflights get a plain response that grants nothing.
			return new Response(null, {
				status: 204,
				headers: { allow: "POST, OPTIONS" },
			});
		default:
			return jsonError(405, "Method not allowed.", { allow: "POST, OPTIONS" });
	}
}
