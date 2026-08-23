/**
 * Markdown content negotiation for the site's HTML pages.
 *
 * An agent that sends `Accept: text/markdown` on a page URL gets that page's
 * markdown twin; everyone else gets the HTML. Both representations keep their
 * own stable URL as well (`/now` and `/now.md`), and the HTML response
 * advertises the twin through a `Link` header, which is how clients that do
 * not negotiate (Codex CLI, for one) discover it.
 *
 * Two things make this work:
 *
 *   - `assets.run_worker_first` in wrangler.jsonc lists exactly the page
 *     paths below. Without it Workers serves the matching file from dist/
 *     directly and this code never runs. The list is generated from the same
 *     registry as the twins (see src/lib/agents/pages.ts).
 *   - Negotiated page URLs are uncacheable. Cloudflare's edge honours `Vary`
 *     on `Accept-Encoding` only, so two representations under one URL would
 *     share a cache key and agents could poison the cache for browsers, and
 *     the other way round. See the cache note in DEPLOY.md.
 *
 * Nothing here reads or records anything about the client beyond the `Accept`
 * header it sent, and nothing is logged (`console.*` is banned across
 * src/worker/).
 */
import { markdownPathFor, pageForPath } from "../lib/agents/pages";

export const MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";

/**
 * What a negotiated page URL responds with. `must-revalidate` plus a zero
 * lifetime keeps both shared and private caches from ever reusing one
 * representation for a client that asked for the other.
 */
export const NEGOTIATED_CACHE_CONTROL = "public, max-age=0, must-revalidate";

/** One entry of an `Accept` header, after parsing. */
export interface MediaRange {
	type: string;
	subtype: string;
	/** Quality value, clamped to 0..1. Absent or unparseable means 1. */
	q: number;
	/** Position in the header, used to break exact ties on client order. */
	index: number;
}

/** How well one media type scored against an `Accept` header. */
export interface MediaTypeScore {
	q: number;
	/** 3 for an exact match, 2 for `type/*`, 1 for `*&#47;*`, 0 for no match. */
	specificity: number;
	index: number;
}

export type Representation = "markdown" | "html" | "none";

/** Splits on commas that are not inside a quoted parameter value. */
function splitOutsideQuotes(header: string, separator: string): string[] {
	const parts: string[] = [];
	let current = "";
	let quoted = false;

	for (let i = 0; i < header.length; i++) {
		const char = header[i] as string;
		if (quoted) {
			current += char;
			if (char === "\\" && i + 1 < header.length) {
				current += header[++i] as string;
			} else if (char === '"') {
				quoted = false;
			}
			continue;
		}
		if (char === '"') {
			quoted = true;
			current += char;
			continue;
		}
		if (char === separator) {
			parts.push(current);
			current = "";
			continue;
		}
		current += char;
	}

	parts.push(current);
	return parts;
}

function parseQuality(parameters: string[]): number {
	for (const parameter of parameters) {
		const match = /^\s*q\s*=\s*("?)([0-9]*\.?[0-9]*)\1\s*$/i.exec(parameter);
		if (match === null) continue;
		const value = Number.parseFloat(match[2] as string);
		if (Number.isNaN(value)) return 1;
		return Math.min(Math.max(value, 0), 1);
	}
	return 1;
}

/** Parses an `Accept` header into media ranges, per RFC 9110 section 12.5.1. */
export function parseAccept(header: string | null | undefined): MediaRange[] {
	if (header === null || header === undefined) return [];

	const ranges: MediaRange[] = [];
	for (const entry of splitOutsideQuotes(header, ",")) {
		const [rawRange, ...parameters] = splitOutsideQuotes(entry, ";");
		const slash = (rawRange ?? "").indexOf("/");
		if (slash < 0) continue;

		const type = (rawRange as string).slice(0, slash).trim().toLowerCase();
		const subtype = (rawRange as string).slice(slash + 1).trim().toLowerCase();
		if (type === "" || subtype === "") continue;

		ranges.push({ type, subtype, q: parseQuality(parameters), index: ranges.length });
	}
	return ranges;
}

/**
 * The quality the client assigned to one media type. The most specific
 * matching range wins, so a `text/markdown;q=0` is not overridden by a
 * `*&#47;*` later in the header.
 */
export function scoreMediaType(ranges: readonly MediaRange[], type: string, subtype: string): MediaTypeScore {
	let best: MediaTypeScore = { q: 0, specificity: 0, index: Number.MAX_SAFE_INTEGER };

	for (const range of ranges) {
		let specificity: number;
		if (range.type === type && range.subtype === subtype) specificity = 3;
		else if (range.type === type && range.subtype === "*") specificity = 2;
		else if (range.type === "*" && range.subtype === "*") specificity = 1;
		else continue;

		if (specificity > best.specificity || (specificity === best.specificity && range.q > best.q)) {
			best = { q: range.q, specificity, index: range.index };
		}
	}

	return best;
}

/**
 * Which representation to serve.
 *
 * Browsers send `text/html` alongside `*&#47;*;q=0.8`, so HTML wins for them
 * with no special casing. A client that prefers markdown on a page with no
 * twin still gets the HTML as long as it did not refuse HTML outright; only
 * a client that will take neither gets a 406.
 */
export function chooseRepresentation(accept: string | null | undefined, hasTwin: boolean): Representation {
	const ranges = parseAccept(accept);
	// No Accept header at all means "anything is fine", which is HTML here.
	if (ranges.length === 0) return "html";

	const html = scoreMediaType(ranges, "text", "html");
	const markdown = scoreMediaType(ranges, "text", "markdown");

	const prefersMarkdown =
		markdown.q > 0 && (markdown.q > html.q || (markdown.q === html.q && markdown.index < html.index));

	if (prefersMarkdown && hasTwin) return "markdown";
	if (html.q > 0) return "html";
	return "none";
}

function alternateLink(markdownPath: string): string {
	return `<${markdownPath}>; rel="alternate"; type="text/markdown"`;
}

/**
 * Re-emits an asset response with the negotiation headers. The upstream
 * status, ETag and encoding are preserved so conditional requests and range
 * handling keep working.
 */
function withNegotiationHeaders(
	upstream: Response,
	extra: { contentType?: string; link?: string },
): Response {
	const response = new Response(upstream.body, upstream);
	response.headers.set("vary", "Accept");
	response.headers.set("cache-control", NEGOTIATED_CACHE_CONTROL);
	if (extra.contentType !== undefined) response.headers.set("content-type", extra.contentType);
	if (extra.link !== undefined) response.headers.set("link", extra.link);
	return response;
}

function notAcceptable(url: URL, markdownPath: string): Response {
	const body = [
		"406 Not Acceptable.",
		"",
		"This page is available as:",
		`  text/html      ${url.origin}${url.pathname}`,
		`  text/markdown  ${url.origin}${markdownPath}`,
		"",
	].join("\n");

	return new Response(body, {
		status: 406,
		headers: {
			"content-type": "text/plain; charset=utf-8",
			vary: "Accept",
			"cache-control": NEGOTIATED_CACHE_CONTROL,
			link: alternateLink(markdownPath),
		},
	});
}

/**
 * Serves a registry page, negotiated. Returns `null` when the request is not
 * for a page with a twin, which leaves it to the plain asset fallthrough.
 */
export async function negotiatePage(request: Request, url: URL, assets: Fetcher): Promise<Response | null> {
	if (request.method !== "GET" && request.method !== "HEAD") return null;

	const page = pageForPath(url.pathname);
	if (page === null || page.source === null) return null;

	const markdownPath = markdownPathFor(page.path);
	const choice = chooseRepresentation(request.headers.get("accept"), true);

	if (choice === "none") return notAcceptable(url, markdownPath);

	if (choice === "markdown") {
		const target = new URL(url);
		target.pathname = markdownPath;
		const twin = await assets.fetch(new Request(target, request));
		// A missing twin can only mean the build and the registry disagree.
		// Serving the page is better than serving the asset server's 404.
		if (twin.status !== 404) {
			return withNegotiationHeaders(twin, { contentType: MARKDOWN_CONTENT_TYPE });
		}
	}

	const html = await assets.fetch(request);
	return withNegotiationHeaders(html, { link: alternateLink(markdownPath) });
}
