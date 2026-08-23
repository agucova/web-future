/**
 * Covers the Accept negotiation between a page and its markdown twin: which
 * representation each kind of client gets, and the headers that keep the two
 * from being confused for one another downstream.
 *
 * Run with: bun test
 */
import { describe, expect, test } from "bun:test";

import { markdownPathFor, pageForPath } from "../src/lib/agents/pages";
import {
	MARKDOWN_CONTENT_TYPE,
	NEGOTIATED_CACHE_CONTROL,
	chooseRepresentation,
	negotiatePage,
	parseAccept,
	scoreMediaType,
} from "../src/worker/negotiate";

/** What a mainstream browser sends. */
const BROWSER_ACCEPT =
	"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8";
/** What the agents on acceptmarkdown.com's status matrix send. */
const AGENT_ACCEPT = "text/markdown, text/plain;q=0.9, text/html;q=0.8, */*;q=0.5";

describe("parsing Accept", () => {
	test("keeps types, q-values and client order", () => {
		expect(parseAccept("text/markdown, text/html;q=0.8")).toEqual([
			{ type: "text", subtype: "markdown", q: 1, index: 0 },
			{ type: "text", subtype: "html", q: 0.8, index: 1 },
		]);
	});

	test("lowercases, tolerates whitespace and ignores unrelated parameters", () => {
		expect(parseAccept("TEXT/Markdown ; charset=UTF-8 ; q=0.5")).toEqual([
			{ type: "text", subtype: "markdown", q: 0.5, index: 0 },
		]);
	});

	test("clamps out-of-range q-values and defaults malformed ones to 1", () => {
		expect(parseAccept("text/html;q=9")[0]?.q).toBe(1);
		expect(parseAccept("text/html;q=0.0")[0]?.q).toBe(0);
		// Not a q-value at all, so the type keeps the default weight rather
		// than being silently refused.
		expect(parseAccept("text/html;q=-3")[0]?.q).toBe(1);
		expect(parseAccept("text/html;q=zzz")[0]?.q).toBe(1);
	});

	test("does not split on a comma inside a quoted parameter", () => {
		expect(parseAccept('text/html;profile="a,b", text/markdown')).toEqual([
			{ type: "text", subtype: "html", q: 1, index: 0 },
			{ type: "text", subtype: "markdown", q: 1, index: 1 },
		]);
	});

	test("drops junk entries rather than the whole header", () => {
		expect(parseAccept("garbage, text/markdown")).toEqual([
			{ type: "text", subtype: "markdown", q: 1, index: 0 },
		]);
		expect(parseAccept("")).toEqual([]);
		expect(parseAccept(null)).toEqual([]);
	});
});

describe("scoring a media type", () => {
	test("prefers the most specific matching range", () => {
		const ranges = parseAccept("*/*;q=0.2, text/*;q=0.5, text/markdown;q=0.9");
		expect(scoreMediaType(ranges, "text", "markdown")).toMatchObject({ q: 0.9, specificity: 3 });
		expect(scoreMediaType(ranges, "text", "html")).toMatchObject({ q: 0.5, specificity: 2 });
		expect(scoreMediaType(ranges, "image", "png")).toMatchObject({ q: 0.2, specificity: 1 });
	});

	test("reports no match as q=0", () => {
		expect(scoreMediaType(parseAccept("application/json"), "text", "html")).toMatchObject({
			q: 0,
			specificity: 0,
		});
	});
});

describe("choosing a representation", () => {
	test("serves markdown when the client prefers it", () => {
		expect(chooseRepresentation("text/markdown", true)).toBe("markdown");
		expect(chooseRepresentation(AGENT_ACCEPT, true)).toBe("markdown");
		expect(chooseRepresentation("text/markdown;q=0.9, text/html;q=0.8", true)).toBe("markdown");
	});

	test("serves HTML to browsers, which send */*;q=0.8 alongside text/html", () => {
		expect(chooseRepresentation(BROWSER_ACCEPT, true)).toBe("html");
	});

	test("serves HTML when nothing was asked for", () => {
		expect(chooseRepresentation(null, true)).toBe("html");
		expect(chooseRepresentation("", true)).toBe("html");
		expect(chooseRepresentation("*/*", true)).toBe("html");
	});

	test("breaks an exact tie on client order", () => {
		expect(chooseRepresentation("text/markdown, text/html", true)).toBe("markdown");
		expect(chooseRepresentation("text/html, text/markdown", true)).toBe("html");
		// Equally specific and equally weighted through one wildcard: HTML.
		expect(chooseRepresentation("text/*", true)).toBe("html");
	});

	test("lets q-values override client order", () => {
		expect(chooseRepresentation("text/markdown;q=0.4, text/html;q=0.9", true)).toBe("html");
		expect(chooseRepresentation("text/html;q=0.4, text/markdown;q=0.9", true)).toBe("markdown");
	});

	test("honours a specific q=0 over a wildcard", () => {
		expect(chooseRepresentation("*/*, text/markdown;q=0", true)).toBe("html");
		expect(chooseRepresentation("*/*, text/html;q=0", true)).toBe("markdown");
	});

	test("falls through to HTML when a page has no twin", () => {
		expect(chooseRepresentation("text/markdown", false)).toBe("none");
		expect(chooseRepresentation(AGENT_ACCEPT, false)).toBe("html");
		expect(chooseRepresentation("text/markdown, text/html;q=0.1", false)).toBe("html");
	});

	test("refuses only when neither representation is acceptable", () => {
		expect(chooseRepresentation("application/json", true)).toBe("none");
		expect(chooseRepresentation("text/html;q=0, text/markdown;q=0", true)).toBe("none");
		expect(chooseRepresentation("text/markdown;q=0, text/html;q=0.5", true)).toBe("html");
	});
});

/** Stands in for the ASSETS binding, answering from a path-keyed table. */
function stubAssets(files: Record<string, string>) {
	const requested: string[] = [];
	const fetcher = {
		async fetch(input: Request | string): Promise<Response> {
			const request = typeof input === "string" ? new Request(input) : input;
			const path = new URL(request.url).pathname;
			requested.push(path);
			const body = files[path];
			if (body === undefined) return new Response("Not Found", { status: 404 });
			return new Response(body, {
				status: 200,
				headers: {
					"content-type": path.endsWith(".md") ? "text/markdown" : "text/html; charset=utf-8",
					etag: `"${path}"`,
					"cache-control": "public, max-age=3600",
				},
			});
		},
	};
	return { fetcher: fetcher as unknown as Fetcher, requested };
}

const SITE = {
	"/now": "<!doctype html><title>What I'm currently up to</title>",
	"/now.md": "# What I'm currently up to\n",
	"/": "<!doctype html><title>Home</title>",
	"/index.md": "# Hi there, I'm Agus 👋\n",
};

function get(path: string, accept?: string): { request: Request; url: URL } {
	const url = new URL(`https://agucova.dev${path}`);
	const headers = accept === undefined ? undefined : { accept };
	return { request: new Request(url, { headers }), url };
}

describe("serving a negotiated page", () => {
	test("serves the twin, typed as markdown and uncacheable", async () => {
		const assets = stubAssets(SITE);
		const { request, url } = get("/now", "text/markdown");

		const response = await negotiatePage(request, url, assets.fetcher);

		expect(response?.status).toBe(200);
		expect(await response?.text()).toBe("# What I'm currently up to\n");
		expect(response?.headers.get("content-type")).toBe(MARKDOWN_CONTENT_TYPE);
		expect(response?.headers.get("vary")).toBe("Accept");
		expect(response?.headers.get("cache-control")).toBe(NEGOTIATED_CACHE_CONTROL);
		expect(assets.requested).toEqual(["/now.md"]);
	});

	test("serves the HTML with a Link header pointing at the twin", async () => {
		const assets = stubAssets(SITE);
		const { request, url } = get("/now", BROWSER_ACCEPT);

		const response = await negotiatePage(request, url, assets.fetcher);

		expect(response?.headers.get("content-type")).toBe("text/html; charset=utf-8");
		expect(response?.headers.get("link")).toBe('</now.md>; rel="alternate"; type="text/markdown"');
		expect(response?.headers.get("vary")).toBe("Accept");
		expect(response?.headers.get("cache-control")).toBe(NEGOTIATED_CACHE_CONTROL);
		expect(assets.requested).toEqual(["/now"]);
	});

	test("maps the root onto /index.md", async () => {
		const assets = stubAssets(SITE);
		const { request, url } = get("/", "text/markdown");

		const response = await negotiatePage(request, url, assets.fetcher);

		expect(await response?.text()).toBe("# Hi there, I'm Agus 👋\n");
		expect(assets.requested).toEqual(["/index.md"]);
	});

	test("treats a trailing slash as the same page", async () => {
		const assets = stubAssets(SITE);
		const { request, url } = get("/now/", "text/markdown");

		expect(await (await negotiatePage(request, url, assets.fetcher))?.text()).toBe(
			"# What I'm currently up to\n",
		);
	});

	test("answers 406 when neither representation is acceptable", async () => {
		const assets = stubAssets(SITE);
		const { request, url } = get("/now", "application/json");

		const response = await negotiatePage(request, url, assets.fetcher);

		expect(response?.status).toBe(406);
		expect(response?.headers.get("content-type")).toBe("text/plain; charset=utf-8");
		expect(await response?.text()).toContain("https://agucova.dev/now.md");
		// Nothing was fetched: the refusal is decided from the header alone.
		expect(assets.requested).toEqual([]);
	});

	test("declines pages outside the registry and pages with no twin", async () => {
		const assets = stubAssets(SITE);

		const missing = get("/nope", "text/markdown");
		expect(await negotiatePage(missing.request, missing.url, assets.fetcher)).toBeNull();

		const htmlOnly = get("/projects/exiliada-del-sur", "text/markdown");
		expect(pageForPath("/projects/exiliada-del-sur")?.source).toBeNull();
		expect(await negotiatePage(htmlOnly.request, htmlOnly.url, assets.fetcher)).toBeNull();

		expect(assets.requested).toEqual([]);
	});

	test("declines write methods", async () => {
		const assets = stubAssets(SITE);
		const url = new URL("https://agucova.dev/now");
		const request = new Request(url, { method: "POST", headers: { accept: "text/markdown" } });

		expect(await negotiatePage(request, url, assets.fetcher)).toBeNull();
	});

	test("falls back to the HTML if the twin is missing from the build", async () => {
		const assets = stubAssets({ "/now": SITE["/now"] });
		const { request, url } = get("/now", "text/markdown");

		const response = await negotiatePage(request, url, assets.fetcher);

		expect(response?.status).toBe(200);
		expect(response?.headers.get("content-type")).toBe("text/html; charset=utf-8");
		expect(assets.requested).toEqual(["/now.md", "/now"]);
	});

	test("advertises the twin URL the registry generates", async () => {
		expect(markdownPathFor("/")).toBe("/index.md");
		expect(markdownPathFor("/now")).toBe("/now.md");
	});
});
