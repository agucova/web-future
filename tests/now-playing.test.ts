/**
 * Covers the /api/now-playing response shaping and the graceful-degradation
 * contract: whatever Spotify does, visitors get a 200 with either a track or
 * `{ playing: false }`.
 *
 * Spotify is never contacted: `resolveNowPlaying` takes the fetch it should
 * use, and the tests hand it a stub serving recorded-shape payloads.
 *
 * Run with: bun test
 */
import { describe, expect, test } from "bun:test";

import {
	handleNowPlayingRequest,
	resolveNowPlaying,
	shapeCurrentlyPlaying,
	shapeRecentlyPlayed,
	type NowPlayingEnv,
} from "../src/worker/now-playing";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const CURRENT_URL = "https://api.spotify.com/v1/me/player/currently-playing";
const RECENT_URL = "https://api.spotify.com/v1/me/player/recently-played?limit=1";

const TRACK_URL = "https://open.spotify.com/track/4Nd0Fj9dTNqSDT1FGGDzHm";

const LIVE_TRACK = {
	is_playing: true,
	currently_playing_type: "track",
	progress_ms: 42_000,
	item: {
		type: "track",
		id: "4Nd0Fj9dTNqSDT1FGGDzHm",
		name: "Blue Monday",
		artists: [{ name: "New Order" }],
		album: { name: "Substance" },
		external_urls: { spotify: TRACK_URL },
	},
};

const RECENT_TRACKS = {
	items: [
		{
			played_at: "2026-08-22T18:04:05.123Z",
			track: {
				type: "track",
				id: "1AMxLpG6TzJHVvIEIJTNIt",
				name: "Ceremony",
				artists: [{ name: "New Order" }, { name: "Joy Division" }],
				album: { name: "Substance" },
				external_urls: { spotify: "https://open.spotify.com/track/1AMxLpG6TzJHVvIEIJTNIt" },
			},
		},
	],
};

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

/** Records every request and answers from a url-keyed route table. */
function stubFetch(routes: Record<string, () => Response>) {
	const calls: string[] = [];
	const fetchLike = async (url: string): Promise<Response> => {
		calls.push(url);
		const route = routes[url];
		if (route === undefined) throw new Error(`Unexpected request: ${url}`);
		return route();
	};
	return { fetchLike, calls };
}

/** Minimal in-memory stand-in for the NOW_PLAYING KV namespace. */
function stubKv() {
	const store = new Map<string, string>();
	return {
		store,
		namespace: {
			async get(key: string, type?: string): Promise<unknown> {
				const raw = store.get(key);
				if (raw === undefined) return null;
				return type === "json" ? JSON.parse(raw) : raw;
			},
			async put(key: string, value: string): Promise<void> {
				store.set(key, value);
			},
			async delete(key: string): Promise<void> {
				store.delete(key);
			},
		},
	};
}

function envWithCredentials(kv?: unknown): NowPlayingEnv {
	return {
		NOW_PLAYING: kv,
		SPOTIFY_CLIENT_ID: "client-id",
		SPOTIFY_CLIENT_SECRET: "client-secret",
		SPOTIFY_REFRESH_TOKEN: "refresh-token",
	} as unknown as NowPlayingEnv;
}

const tokenRoute = () => json({ access_token: "access-token", token_type: "Bearer", expires_in: 3600 });

describe("shaping Spotify payloads", () => {
	test("shapes a live track", () => {
		expect(shapeCurrentlyPlaying(LIVE_TRACK)).toEqual({
			playing: true,
			track: "Blue Monday",
			artist: "New Order",
			album: "Substance",
			url: TRACK_URL,
		});
	});

	test("shapes a live podcast episode using the show name", () => {
		const shaped = shapeCurrentlyPlaying({
			is_playing: true,
			currently_playing_type: "episode",
			item: {
				type: "episode",
				id: "512ojhOuo1ktJprKbVcKyQ",
				name: "The one about caching",
				show: { name: "Some Podcast" },
				external_urls: { spotify: "https://open.spotify.com/episode/512ojhOuo1ktJprKbVcKyQ" },
			},
		});
		expect(shaped).toEqual({
			playing: true,
			track: "The one about caching",
			artist: "Some Podcast",
			url: "https://open.spotify.com/episode/512ojhOuo1ktJprKbVcKyQ",
		});
	});

	test("reconstructs the url from the id when external_urls is absent", () => {
		const shaped = shapeCurrentlyPlaying({
			is_playing: true,
			currently_playing_type: "track",
			item: { type: "track", id: "abc123", name: "Untitled", artists: [{ name: "Someone" }] },
		});
		expect(shaped?.url).toBe("https://open.spotify.com/track/abc123");
		expect(shaped?.album).toBeUndefined();
	});

	test("reports nothing live for paused playback, ads and junk", () => {
		expect(shapeCurrentlyPlaying({ ...LIVE_TRACK, is_playing: false })).toBeNull();
		expect(shapeCurrentlyPlaying({ is_playing: true, currently_playing_type: "ad", item: null })).toBeNull();
		expect(shapeCurrentlyPlaying({ is_playing: true, currently_playing_type: "track", item: null })).toBeNull();
		expect(shapeCurrentlyPlaying(null)).toBeNull();
		expect(shapeCurrentlyPlaying("nope")).toBeNull();
		// A track with no name or no artist is not worth rendering.
		expect(shapeCurrentlyPlaying({ is_playing: true, item: { name: "", artists: [] } })).toBeNull();
	});

	test("shapes the most recent track with a normalised playedAt", () => {
		expect(shapeRecentlyPlayed(RECENT_TRACKS)).toEqual({
			playing: false,
			track: "Ceremony",
			artist: "New Order, Joy Division",
			album: "Substance",
			url: "https://open.spotify.com/track/1AMxLpG6TzJHVvIEIJTNIt",
			playedAt: "2026-08-22T18:04:05.123Z",
		});
	});

	test("drops an unparseable playedAt instead of the whole track", () => {
		const shaped = shapeRecentlyPlayed({
			items: [{ played_at: "not a date", track: RECENT_TRACKS.items[0].track }],
		});
		expect(shaped?.playing).toBe(false);
		expect(shaped?.playedAt).toBeUndefined();
	});

	test("reports nothing for an empty or malformed history", () => {
		expect(shapeRecentlyPlayed({ items: [] })).toBeNull();
		expect(shapeRecentlyPlayed({})).toBeNull();
		expect(shapeRecentlyPlayed(null)).toBeNull();
	});
});

describe("resolving the endpoint response", () => {
	test("returns the live track", async () => {
		const { fetchLike, calls } = stubFetch({
			[TOKEN_URL]: tokenRoute,
			[CURRENT_URL]: () => json(LIVE_TRACK),
		});

		expect(await resolveNowPlaying(envWithCredentials(), fetchLike)).toEqual({
			playing: true,
			track: "Blue Monday",
			artist: "New Order",
			album: "Substance",
			url: TRACK_URL,
		});
		// Recently-played is not consulted while something is live.
		expect(calls).toEqual([TOKEN_URL, CURRENT_URL]);
	});

	test("falls back to recently played on a 204 from currently-playing", async () => {
		const { fetchLike, calls } = stubFetch({
			[TOKEN_URL]: tokenRoute,
			[CURRENT_URL]: () => new Response(null, { status: 204 }),
			[RECENT_URL]: () => json(RECENT_TRACKS),
		});

		const resolved = await resolveNowPlaying(envWithCredentials(), fetchLike);
		expect(resolved).toMatchObject({ playing: false, track: "Ceremony", playedAt: "2026-08-22T18:04:05.123Z" });
		expect(calls).toEqual([TOKEN_URL, CURRENT_URL, RECENT_URL]);
	});

	test("reports nothing playing when the integration is unconfigured", async () => {
		const { fetchLike, calls } = stubFetch({});
		expect(await resolveNowPlaying({} as NowPlayingEnv, fetchLike)).toEqual({ playing: false });
		expect(calls).toEqual([]);
	});

	test("reports nothing playing when the refresh token is rejected", async () => {
		const { fetchLike } = stubFetch({
			[TOKEN_URL]: () => json({ error: "invalid_grant" }, 400),
		});
		expect(await resolveNowPlaying(envWithCredentials(), fetchLike)).toEqual({ playing: false });
	});

	test("reports nothing playing when Spotify is down or the network fails", async () => {
		const outage = stubFetch({
			[TOKEN_URL]: tokenRoute,
			[CURRENT_URL]: () => json({ error: { status: 503 } }, 503),
			[RECENT_URL]: () => json({ error: { status: 503 } }, 503),
		});
		expect(await resolveNowPlaying(envWithCredentials(), outage.fetchLike)).toEqual({ playing: false });

		const offline = async (): Promise<Response> => {
			throw new TypeError("network error");
		};
		expect(await resolveNowPlaying(envWithCredentials(), offline)).toEqual({ playing: false });
	});

	test("survives a garbled payload", async () => {
		const { fetchLike } = stubFetch({
			[TOKEN_URL]: tokenRoute,
			[CURRENT_URL]: () => new Response("<html>not json</html>", { status: 200 }),
			[RECENT_URL]: () => json({ items: "nonsense" }),
		});
		expect(await resolveNowPlaying(envWithCredentials(), fetchLike)).toEqual({ playing: false });
	});

	test("retries once with a fresh token when a cached one is rejected", async () => {
		const kv = stubKv();
		// Seed a stale-but-unexpired access token, as a warm cache would hold.
		kv.store.set(
			"token:v1",
			JSON.stringify({ accessToken: "expired-token", expiresAt: Date.now() + 60_000 }),
		);

		let currentCalls = 0;
		const { fetchLike, calls } = stubFetch({
			[TOKEN_URL]: tokenRoute,
			[CURRENT_URL]: () => {
				currentCalls++;
				return currentCalls === 1 ? json({ error: { status: 401 } }, 401) : json(LIVE_TRACK);
			},
		});

		const resolved = await resolveNowPlaying(envWithCredentials(kv.namespace), fetchLike);
		expect(resolved).toMatchObject({ playing: true, track: "Blue Monday" });
		expect(calls).toEqual([CURRENT_URL, TOKEN_URL, CURRENT_URL]);
	});

	test("serves the cached response instead of calling Spotify again", async () => {
		const kv = stubKv();
		const { fetchLike, calls } = stubFetch({
			[TOKEN_URL]: tokenRoute,
			[CURRENT_URL]: () => json(LIVE_TRACK),
		});

		const first = await resolveNowPlaying(envWithCredentials(kv.namespace), fetchLike);
		const second = await resolveNowPlaying(envWithCredentials(kv.namespace), fetchLike);

		expect(second).toEqual(first);
		expect(calls).toEqual([TOKEN_URL, CURRENT_URL]);
		expect(kv.store.has("response:v1")).toBe(true);
		expect(kv.store.has("token:v1")).toBe(true);
	});

	test("reuses the cached access token across cache windows", async () => {
		const kv = stubKv();
		const { fetchLike, calls } = stubFetch({
			[TOKEN_URL]: tokenRoute,
			[CURRENT_URL]: () => json(LIVE_TRACK),
		});

		await resolveNowPlaying(envWithCredentials(kv.namespace), fetchLike);
		kv.store.delete("response:v1"); // The 45s window elapsed.
		await resolveNowPlaying(envWithCredentials(kv.namespace), fetchLike);

		expect(calls).toEqual([TOKEN_URL, CURRENT_URL, CURRENT_URL]);
	});
});

describe("the HTTP handler", () => {
	test("answers 200 with a public cache header when unconfigured", async () => {
		const response = await handleNowPlayingRequest(
			new Request("https://agucova.dev/api/now-playing"),
			{} as NowPlayingEnv,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("application/json");
		expect(response.headers.get("cache-control")).toBe("public, max-age=30");
		expect(await response.json()).toEqual({ playing: false });
	});

	test("rejects write methods", async () => {
		const response = await handleNowPlayingRequest(
			new Request("https://agucova.dev/api/now-playing", { method: "POST" }),
			{} as NowPlayingEnv,
		);
		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
	});

	test("answers preflights without granting cross-origin access", async () => {
		const response = await handleNowPlayingRequest(
			new Request("https://agucova.dev/api/now-playing", { method: "OPTIONS" }),
			{} as NowPlayingEnv,
		);
		expect(response.status).toBe(204);
		expect(response.headers.get("access-control-allow-origin")).toBeNull();
	});
});
