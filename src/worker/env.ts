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
}
