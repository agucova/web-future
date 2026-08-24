/**
 * Where-am-I endpoint (GET /api/where).
 *
 * Reports which city Agus has published, at city resolution and no finer:
 *
 *   { disclosed: true, city, country, latitude, longitude, ... }
 *   { disclosed: false }
 *
 * The design constraint that shapes everything else: **DNS is the source of
 * truth, not a copy of one.** The claim lives in a LOC record and a TXT
 * record on agucova.dev; this endpoint resolves them over DNS-over-HTTPS and
 * renders what comes back. There is no second store holding a location that
 * could quietly disagree with `dig`, because there is no second store. A
 * reader who runs
 *
 *   dig LOC agucova.dev
 *   dig TXT agucova.dev
 *
 * is looking at the same bytes this endpoint looked at, and can map the
 * coordinates to a city name with the table in src/lib/where/cities.ts, which
 * is public. That is the point of the feature; speed is not.
 *
 * Privacy constraints, which are load-bearing:
 *
 *   - **Opt-in, and fail closed.** Disclosure requires the `disclose:v1` flag
 *     in the WHERE namespace to read exactly "on". A missing flag, an
 *     unreadable namespace, an absent binding, a KV outage or any other value
 *     all mean silence. This is the opposite polarity to Spotify's ghost mode
 *     (`src/worker/now-playing.ts`), where an absent flag means "keep
 *     reporting", and it is a different flag in a different namespace on
 *     purpose: neither switch can ever be mistaken for the other.
 *   - **City level only.** Nothing finer than a whole arcminute and a city
 *     diameter is ever published, and the coarseness is stated inside the
 *     record itself rather than only in prose (see src/lib/where/loc.ts).
 *   - **Nothing is inferred.** Coordinates that do not match a city in the
 *     table publish nothing. The endpoint never invents a label, never
 *     reverse-geocodes, and never calls anything except a DNS resolver.
 *   - **It expires.** The TXT record carries the date the claim runs out.
 *     Past that the endpoint goes quiet on its own, so a location set three
 *     months ago stops being asserted whether or not anyone remembers it.
 *   - **Never logs.** `console.*` is banned across src/worker/ and
 *     observability stays disabled. Nothing here carries visitor data anyway:
 *     every visitor gets the identical answer, and no request attribute is
 *     read or forwarded.
 *
 * What the endpoint deliberately does *not* have is any signal of whether the
 * published location is accurate. The site's stated policy is that it may be
 * wrong or stale on purpose, and that possibility is disclosed permanently
 * rather than per trip. A per-trip "this one is noise" flag would announce
 * exactly the trips it exists to protect, so no such field exists anywhere in
 * this file, in KV, or in DNS.
 */
import { RECORD_TTL_SECONDS, WHERE_NAME, expiryOf } from "../lib/where";
import { type FetchLike, SILENT, type WhereResponse, resolveFromDns } from "../lib/where/doh";

/**
 * The response shapes, the DNS-over-HTTPS client and all of the parsing live
 * in `src/lib/where/doh.ts` rather than here, because the browser runs them
 * too. The /where page resolves the records itself, from resolvers of its
 * own choosing, instead of taking this endpoint's word for what DNS says.
 * That keeps this endpoint useful (agents, no-JS readers, one round trip)
 * without it being the only way to learn the answer, which would put a cache
 * back in the middle of a feature whose whole premise is that there isn't one.
 *
 * Re-exported below because this module is the endpoint's public face and its
 * tests address it here.
 */
export {
	type FetchLike,
	type WhereDisclosed,
	type WhereResponse,
	type WhereSilent,
	resolveFromDns,
	selectLoc,
	selectTerms,
	shape,
	unquoteTxt,
} from "../lib/where/doh";

/**
 * Bindings this endpoint reads.
 *
 * `WHERE` is optional in the type as well as at runtime because a missing
 * binding has to mean silence rather than a crash, and writing it that way
 * makes the fail-closed path something the type checker can see.
 */
export interface WhereEnv {
	WHERE?: KVNamespace;
	/**
	 * Development-only override of the DNS name to read. Unset in production,
	 * where the constant applies. It can only change *which* name is
	 * resolved; there is no way to hand this endpoint an answer.
	 */
	WHERE_NAME?: string;
}

/** KV's minimum expirationTtl; freshness is enforced by the stamp inside. */
const KV_MIN_TTL_SECONDS = 60;

const CACHE_KEY = "answer:v1";
/** Opt-in gate. Must read exactly "on"; everything else is silence. */
const DISCLOSE_FLAG_KEY = "disclose:v1";
const DISCLOSE_ON = "on";

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

interface CachedAnswer {
	/** Epoch millis after which the entry must be resolved again. */
	expiresAt: number;
	value: WhereResponse;
}

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

// --- the opt-in gate --------------------------------------------------------

/**
 * Whether disclosure is currently permitted.
 *
 * Every failure mode answers false: no binding, no key, a value that is not
 * exactly "on", a malformed value, a KV outage. "I could not establish that
 * publishing is allowed" and "publishing is not allowed" have to be the same
 * answer, or the guarantee is not a guarantee.
 *
 * This gate governs what the *site* says. It is not what keeps a location
 * private: a record in public DNS is public the moment it is written, and the
 * control for that is whether the CLI has written one at all. What the flag
 * buys is a kill switch that beats the record's TTL, and a way to go quiet
 * without waiting on a DNS delete to propagate.
 */
async function isDisclosureOn(kv: KVNamespace): Promise<boolean> {
	try {
		return (await kv.get(DISCLOSE_FLAG_KEY, "text")) === DISCLOSE_ON;
	} catch {
		return false;
	}
}

// --- KV cache ---------------------------------------------------------------

async function readCache(kv: KVNamespace): Promise<WhereResponse | null> {
	try {
		const cached = await kv.get<CachedAnswer>(CACHE_KEY, "json");
		if (cached === null || typeof cached.expiresAt !== "number") return null;
		if (cached.expiresAt <= Date.now()) return null;
		const value = asRecord(cached.value);
		if (value === null || typeof value.disclosed !== "boolean") return null;
		return cached.value as WhereResponse;
	} catch {
		return null;
	}
}

async function writeCache(kv: KVNamespace, value: WhereResponse, now: number): Promise<void> {
	// A cached disclosure must not outlive the expiry it is disclosing, so the
	// window is clipped to whichever comes first.
	let expiresAt = now + RECORD_TTL_SECONDS * 1000;
	if (value.disclosed) {
		expiresAt = Math.min(expiresAt, expiryOf({ since: value.since, until: value.until }));
	}
	if (expiresAt <= now) return;

	try {
		await kv.put(CACHE_KEY, JSON.stringify({ expiresAt, value } satisfies CachedAnswer), {
			expirationTtl: Math.max(Math.ceil((expiresAt - now) / 1000), KV_MIN_TTL_SECONDS),
		});
	} catch {
		// Caching is best effort: a failed write only costs an extra lookup.
	}
}

// --- the endpoint -----------------------------------------------------------

/**
 * The published answer.
 *
 * The gate is read before the cache, so switching disclosure off takes effect
 * on the next request rather than at the end of the cache window, and a
 * disclosure captured seconds earlier cannot outlive the switch.
 */
export async function resolveWhere(env: WhereEnv, doFetch: FetchLike = defaultFetch): Promise<WhereResponse> {
	const kv = env.WHERE;
	if (kv === undefined) return SILENT;
	if (!(await isDisclosureOn(kv))) return SILENT;

	const cached = await readCache(kv);
	if (cached !== null) return cached;

	const now = Date.now();
	const name = asText(env.WHERE_NAME) ?? WHERE_NAME;
	const resolved = await resolveFromDns(name, doFetch, now);
	await writeCache(kv, resolved, now);
	return resolved;
}

const ALLOWED_METHODS = "GET, HEAD, OPTIONS";

export async function handleWhereRequest(request: Request, env: WhereEnv): Promise<Response> {
	if (request.method === "OPTIONS") {
		// Same-origin API: no CORS headers, same as the other endpoints.
		return new Response(null, { status: 204, headers: { allow: ALLOWED_METHODS } });
	}
	if (request.method !== "GET" && request.method !== "HEAD") {
		return new Response(JSON.stringify({ error: "Method not allowed." }), {
			status: 405,
			headers: {
				"content-type": "application/json",
				"cache-control": "no-store",
				allow: ALLOWED_METHODS,
			},
		});
	}

	let body: WhereResponse;
	try {
		body = await resolveWhere(env);
	} catch {
		body = SILENT;
	}

	return new Response(JSON.stringify(body), {
		status: 200,
		headers: {
			"content-type": "application/json",
			// The same JSON for everyone, and it matches the records' own TTL.
			"cache-control": `public, max-age=${RECORD_TTL_SECONDS}`,
		},
	});
}
