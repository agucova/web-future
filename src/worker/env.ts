/**
 * Bindings available to the site Worker, as configured in wrangler.jsonc.
 */
export interface Env {
	/** Static assets built by Astro (dist/). */
	ASSETS: Fetcher;
	/** Email Sending binding used by the feedback endpoint. */
	EMAIL: SendEmail;
	/** Turnstile secret key (Worker secret; .dev.vars locally). */
	TURNSTILE_SECRET: string;
	/**
	 * Cache for the now-playing endpoint: the shaped response and the Spotify
	 * access token. Holds no visitor data.
	 */
	NOW_PLAYING: KVNamespace;
	/**
	 * Spotify app credentials for the now-playing endpoint (Worker secrets;
	 * .dev.vars locally). Optional: the endpoint reports nothing playing until
	 * all three are set. See docs/spotify-setup.md.
	 */
	SPOTIFY_CLIENT_ID?: string;
	SPOTIFY_CLIENT_SECRET?: string;
	SPOTIFY_REFRESH_TOKEN?: string;
	/**
	 * Opt-in gate and DNS answer cache for GET /api/where. Deliberately its
	 * own namespace rather than a second key in NOW_PLAYING: the location
	 * switch and the Spotify ghost switch must be impossible to confuse.
	 * Optional so that a missing binding means silence rather than a crash
	 * (see src/worker/where.ts).
	 */
	WHERE?: KVNamespace;
	/**
	 * Development-only override of the DNS name /api/where reads. Unset in
	 * production. It selects a name to resolve, and cannot supply an answer.
	 */
	WHERE_NAME?: string;
}
