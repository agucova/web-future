/**
 * Worker entry point for agucova.dev: serves the static Astro build and
 * routes API endpoints. Future dynamic endpoints slot in beside
 * /api/feedback, /api/now-playing and /api/where here.
 *
 * Only the paths in `assets.run_worker_first` (wrangler.jsonc) reach this
 * handler: the API, and the page URLs that negotiate between HTML and their
 * markdown twin. Everything else, hashed /_astro/* chunks above all, is
 * served straight from dist/ without a Worker invocation. The fallthrough to
 * env.ASSETS.fetch covers the pages that do not negotiate, client-side
 * redirects and the 404 case.
 */
import type { Env } from "./env";
import { handleFeedbackRequest } from "./feedback";
import { negotiatePage } from "./negotiate";
import { handleNowPlayingRequest } from "./now-playing";
import { handleWhereRequest } from "./where";

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/api/feedback") {
			return handleFeedbackRequest(request, env);
		}

		if (url.pathname === "/api/now-playing") {
			return handleNowPlayingRequest(request, env);
		}

		if (url.pathname === "/api/where") {
			return handleWhereRequest(request, env);
		}

		const negotiated = await negotiatePage(request, url, env.ASSETS);
		if (negotiated !== null) return negotiated;

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
