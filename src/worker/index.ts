/**
 * Worker entry point for agucova.dev: serves the static Astro build and
 * routes API endpoints. Future dynamic endpoints slot in beside
 * /api/feedback and /api/now-playing here.
 *
 * Static asset requests never reach this handler (with `run_worker_first`
 * unset, Workers serves matching assets directly); the fallthrough to
 * env.ASSETS.fetch covers non-asset paths like client-side redirects and
 * the 404 case.
 */
import type { Env } from "./env";
import { handleFeedbackRequest } from "./feedback";
import { handleNowPlayingRequest } from "./now-playing";

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/api/feedback") {
			return handleFeedbackRequest(request, env);
		}

		if (url.pathname === "/api/now-playing") {
			return handleNowPlayingRequest(request, env);
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
