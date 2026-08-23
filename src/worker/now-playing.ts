/**
 * Now-playing endpoint (GET /api/now-playing).
 *
 * Reports what Agustín is listening to on Spotify: the currently playing
 * track when there is one, otherwise the most recently played track. The
 * response is a small fixed shape:
 *
 *   { playing: true,  track, artist, album?, url }
 *   { playing: false, track, artist, album?, url, playedAt }
 *   { playing: false }                                  // nothing to report
 *
 * Design constraints:
 *   - Never fails towards visitors. Missing secrets, Spotify outages,
 *     malformed payloads and KV errors all degrade to `{ playing: false }`
 *     with a 200, so the caller only has to handle one failure mode.
 *   - Never logs. `console.*` is banned across src/worker/ (see the privacy
 *     invariants in feedback.ts) and observability stays disabled. Nothing
 *     here carries visitor data anyway: every visitor gets the identical
 *     cached JSON, and no request attribute is read or forwarded.
 *   - Spotify is called at most once per cache window, not once per visitor.
 *     The shaped response and the access token both live in the NOW_PLAYING
 *     KV namespace.
 */
import type { Env } from "./env";

/** A resolved track (live or historical) plus its liveness flag. */
export interface NowPlayingTrack {
	playing: boolean;
	track: string;
	artist: string;
	album?: string;
	url: string;
	/** ISO timestamp of when the track finished. Only set when not live. */
	playedAt?: string;
}

/** Nothing to report: no playback, or the integration is not configured. */
export interface NowPlayingIdle {
	playing: false;
}

export type NowPlayingResponse = NowPlayingTrack | NowPlayingIdle;

/**
 * Bindings this endpoint reads. Secrets are absent until configured, and the
 * KV binding is optional so the logic stays testable (and survives a config
 * where the namespace is missing) without a cache.
 */
export type NowPlayingEnv = Partial<Pick<Env, "NOW_PLAYING">> &
	Pick<Env, "SPOTIFY_CLIENT_ID" | "SPOTIFY_CLIENT_SECRET" | "SPOTIFY_REFRESH_TOKEN">;

/** Injection seam: the unit tests pass a stub in place of global fetch. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const CURRENTLY_PLAYING_ENDPOINT = "https://api.spotify.com/v1/me/player/currently-playing";
const RECENTLY_PLAYED_ENDPOINT = "https://api.spotify.com/v1/me/player/recently-played?limit=1";

/** How long a shaped response is served from KV before Spotify is asked again. */
const RESPONSE_TTL_SECONDS = 45;
/**
 * KV's minimum `expirationTtl`. Freshness below it is enforced by the
 * `expiresAt` stamp inside the entry; this only bounds how long a forgotten
 * entry lingers.
 */
const KV_MIN_TTL_SECONDS = 60;
/** Margin subtracted from the access token lifetime to absorb clock skew. */
const TOKEN_SKEW_SECONDS = 60;
/** Per-subrequest budget, so a hanging Spotify call can't stall the response. */
const REQUEST_TIMEOUT_MS = 5_000;

const RESPONSE_CACHE_KEY = "response:v1";
const TOKEN_CACHE_KEY = "token:v1";

const IDLE: NowPlayingIdle = { playing: false };

interface SpotifyCredentials {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
}

interface CachedResponse {
	/** Epoch millis after which the entry must be refreshed. */
	expiresAt: number;
	value: NowPlayingResponse;
}

interface CachedToken {
	expiresAt: number;
	accessToken: string;
}

/** Outcome of one Spotify API call. 401 is singled out to trigger a retry. */
type ApiResult = { ok: true; body: unknown } | { ok: false; unauthorized: boolean };

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

// --- payload shaping (pure, unit tested) ------------------------------------

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

/** Joined artist names, or the show name for a podcast episode. */
function readArtist(item: Record<string, unknown>): string | null {
	const artists = item.artists;
	if (Array.isArray(artists)) {
		const names: string[] = [];
		for (const artist of artists) {
			const name = asText(asRecord(artist)?.name);
			if (name !== null) names.push(name);
		}
		if (names.length > 0) return names.join(", ");
	}
	return asText(asRecord(item.show)?.name);
}

/** The open.spotify.com link, reconstructed from the id when absent. */
function readUrl(item: Record<string, unknown>): string | null {
	const external = asText(asRecord(item.external_urls)?.spotify);
	if (external !== null) return external;

	const id = asText(item.id);
	const type = asText(item.type);
	if (id === null || (type !== "track" && type !== "episode")) return null;
	return `https://open.spotify.com/${type}/${id}`;
}

/** Normalises Spotify's timestamp to ISO, dropping anything unparseable. */
function readPlayedAt(value: unknown): string | null {
	const raw = asText(value);
	if (raw === null) return null;
	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Reduces a Spotify track or episode object to the public fields. */
function shapeItem(item: unknown): Omit<NowPlayingTrack, "playing"> | null {
	const record = asRecord(item);
	if (record === null) return null;

	const track = asText(record.name);
	const artist = readArtist(record);
	const url = readUrl(record);
	if (track === null || artist === null || url === null) return null;

	const album = asText(asRecord(record.album)?.name);
	return album === null ? { track, artist, url } : { track, artist, album, url };
}

/**
 * Shapes `/v1/me/player/currently-playing`. Returns null when there is no
 * live track to report, which sends the caller on to recently-played:
 * a paused player, an ad break, or an item Spotify won't describe.
 */
export function shapeCurrentlyPlaying(payload: unknown): NowPlayingTrack | null {
	const record = asRecord(payload);
	if (record === null) return null;

	const type = asText(record.currently_playing_type);
	if (type !== null && type !== "track" && type !== "episode") return null;
	// Paused playback is not liveness; the recent history is a better answer.
	if (record.is_playing !== true) return null;

	const shaped = shapeItem(record.item);
	return shaped === null ? null : { playing: true, ...shaped };
}

/** Shapes `/v1/me/player/recently-played?limit=1`. */
export function shapeRecentlyPlayed(payload: unknown): NowPlayingTrack | null {
	const record = asRecord(payload);
	if (record === null) return null;

	const items = record.items;
	if (!Array.isArray(items)) return null;

	const first = asRecord(items[0]);
	if (first === null) return null;

	const shaped = shapeItem(first.track);
	if (shaped === null) return null;

	const playedAt = readPlayedAt(first.played_at);
	return playedAt === null ? { playing: false, ...shaped } : { playing: false, ...shaped, playedAt };
}

// --- KV cache ---------------------------------------------------------------

async function readCachedResponse(kv: KVNamespace): Promise<NowPlayingResponse | null> {
	try {
		const cached = await kv.get<CachedResponse>(RESPONSE_CACHE_KEY, "json");
		if (cached === null || typeof cached.expiresAt !== "number") return null;
		if (cached.expiresAt <= Date.now()) return null;
		const value = asRecord(cached.value);
		return value !== null && typeof value.playing === "boolean" ? (cached.value as NowPlayingResponse) : null;
	} catch {
		return null;
	}
}

async function writeCachedResponse(kv: KVNamespace, value: NowPlayingResponse): Promise<void> {
	const entry: CachedResponse = { expiresAt: Date.now() + RESPONSE_TTL_SECONDS * 1000, value };
	try {
		await kv.put(RESPONSE_CACHE_KEY, JSON.stringify(entry), { expirationTtl: KV_MIN_TTL_SECONDS });
	} catch {
		// Caching is best effort: a failed write only costs an extra API call.
	}
}

async function readCachedToken(kv: KVNamespace): Promise<string | null> {
	try {
		const cached = await kv.get<CachedToken>(TOKEN_CACHE_KEY, "json");
		if (cached === null || typeof cached.expiresAt !== "number") return null;
		if (cached.expiresAt <= Date.now()) return null;
		return asText(cached.accessToken);
	} catch {
		return null;
	}
}

async function writeCachedToken(kv: KVNamespace, accessToken: string, expiresIn: number): Promise<void> {
	const lifetime = Math.floor(expiresIn) - TOKEN_SKEW_SECONDS;
	if (lifetime <= 0) return;
	const entry: CachedToken = { expiresAt: Date.now() + lifetime * 1000, accessToken };
	try {
		await kv.put(TOKEN_CACHE_KEY, JSON.stringify(entry), {
			expirationTtl: Math.max(lifetime, KV_MIN_TTL_SECONDS),
		});
	} catch {
		// See writeCachedResponse.
	}
}

async function deleteCachedToken(kv: KVNamespace | undefined): Promise<void> {
	if (kv === undefined) return;
	try {
		await kv.delete(TOKEN_CACHE_KEY);
	} catch {
		// See writeCachedResponse.
	}
}

// --- Spotify ----------------------------------------------------------------

function readCredentials(env: NowPlayingEnv): SpotifyCredentials | null {
	const clientId = asText(env.SPOTIFY_CLIENT_ID);
	const clientSecret = asText(env.SPOTIFY_CLIENT_SECRET);
	const refreshToken = asText(env.SPOTIFY_REFRESH_TOKEN);
	if (clientId === null || clientSecret === null || refreshToken === null) return null;
	return { clientId, clientSecret, refreshToken };
}

/** Authorization-code refresh flow: refresh token in, access token out. */
async function requestAccessToken(
	credentials: SpotifyCredentials,
	doFetch: FetchLike,
): Promise<{ accessToken: string; expiresIn: number } | null> {
	try {
		const response = await doFetch(TOKEN_ENDPOINT, {
			method: "POST",
			headers: {
				authorization: `Basic ${btoa(`${credentials.clientId}:${credentials.clientSecret}`)}`,
				"content-type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				grant_type: "refresh_token",
				refresh_token: credentials.refreshToken,
			}).toString(),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		if (!response.ok) return null;

		const payload = asRecord(await response.json());
		const accessToken = asText(payload?.access_token);
		if (accessToken === null) return null;

		const expiresIn = typeof payload?.expires_in === "number" ? payload.expires_in : 0;
		return { accessToken, expiresIn };
	} catch {
		return null;
	}
}

async function getAccessToken(
	credentials: SpotifyCredentials,
	kv: KVNamespace | undefined,
	doFetch: FetchLike,
): Promise<string | null> {
	if (kv !== undefined) {
		const cached = await readCachedToken(kv);
		if (cached !== null) return cached;
	}

	const token = await requestAccessToken(credentials, doFetch);
	if (token === null) return null;
	if (kv !== undefined) await writeCachedToken(kv, token.accessToken, token.expiresIn);
	return token.accessToken;
}

async function requestSpotify(url: string, accessToken: string, doFetch: FetchLike): Promise<ApiResult> {
	try {
		const response = await doFetch(url, {
			headers: { authorization: `Bearer ${accessToken}` },
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		if (response.status === 401) return { ok: false, unauthorized: true };
		// 204 means "nothing is playing"; other non-2xx statuses are outages,
		// rate limits or scope problems. All of them just mean "no answer here".
		if (response.status === 204 || !response.ok) return { ok: false, unauthorized: false };
		return { ok: true, body: await response.json() };
	} catch {
		return { ok: false, unauthorized: false };
	}
}

/** Currently playing, else most recently played, else idle. */
async function readPlayback(accessToken: string, doFetch: FetchLike): Promise<NowPlayingResponse | "unauthorized"> {
	const current = await requestSpotify(CURRENTLY_PLAYING_ENDPOINT, accessToken, doFetch);
	if (!current.ok && current.unauthorized) return "unauthorized";
	if (current.ok) {
		const live = shapeCurrentlyPlaying(current.body);
		if (live !== null) return live;
	}

	const recent = await requestSpotify(RECENTLY_PLAYED_ENDPOINT, accessToken, doFetch);
	if (!recent.ok && recent.unauthorized) return "unauthorized";
	if (recent.ok) {
		const previous = shapeRecentlyPlayed(recent.body);
		if (previous !== null) return previous;
	}

	return IDLE;
}

async function fetchFromSpotify(
	credentials: SpotifyCredentials,
	kv: KVNamespace | undefined,
	doFetch: FetchLike,
): Promise<NowPlayingResponse> {
	const accessToken = await getAccessToken(credentials, kv, doFetch);
	if (accessToken === null) return IDLE;

	const result = await readPlayback(accessToken, doFetch);
	if (result !== "unauthorized") return result;

	// The cached access token was rejected. Drop it and try once with a fresh
	// one; a second rejection means the refresh token itself is no longer good.
	await deleteCachedToken(kv);
	const retryToken = await getAccessToken(credentials, kv, doFetch);
	if (retryToken === null) return IDLE;

	const retry = await readPlayback(retryToken, doFetch);
	return retry === "unauthorized" ? IDLE : retry;
}

/**
 * Resolves the response, serving the KV cache when it is still fresh. The
 * result is cached whether or not Spotify had anything to say, so a broken
 * integration costs one call per cache window rather than one per visitor.
 */
export async function resolveNowPlaying(env: NowPlayingEnv, doFetch: FetchLike = defaultFetch): Promise<NowPlayingResponse> {
	const credentials = readCredentials(env);
	if (credentials === null) return IDLE;

	const kv = env.NOW_PLAYING;
	if (kv !== undefined) {
		const cached = await readCachedResponse(kv);
		if (cached !== null) return cached;
	}

	const resolved = await fetchFromSpotify(credentials, kv, doFetch);
	if (kv !== undefined) await writeCachedResponse(kv, resolved);
	return resolved;
}

// --- HTTP -------------------------------------------------------------------

const ALLOWED_METHODS = "GET, HEAD, OPTIONS";

export async function handleNowPlayingRequest(request: Request, env: NowPlayingEnv): Promise<Response> {
	if (request.method === "OPTIONS") {
		// Same-origin API: no CORS headers, same as /api/feedback.
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

	let body: NowPlayingResponse;
	try {
		body = await resolveNowPlaying(env);
	} catch {
		body = IDLE;
	}

	return new Response(JSON.stringify(body), {
		status: 200,
		headers: {
			"content-type": "application/json",
			// The same JSON for everyone, so shared caches are welcome to it.
			"cache-control": "public, max-age=30",
		},
	});
}
