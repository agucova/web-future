/**
 * Guards the page registry against drift. It is the single source of truth
 * for the markdown twins, /llms.txt and the Worker's negotiation, so a page
 * that is not in it is invisible to all three at once, and a Worker-first
 * route that is not in it never negotiates.
 *
 * Run with: bun test
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Glob } from "bun";

import {
	PAGES,
	TWINNED_PAGES,
	markdownPathFor,
	markdownRouteParam,
	normalizePath,
	pageForPath,
	workerFirstRoutes,
} from "../src/lib/agents/pages";

const ROOT = new URL("..", import.meta.url).pathname;

/** The route Astro emits for a page file, e.g. `now.md` becomes `/now`. */
function routeFor(relativePath: string): string {
	const withoutExtension = relativePath.replace(/\.(astro|md)$/, "");
	return withoutExtension === "index" ? "/" : `/${withoutExtension}`;
}

/** Every routable page file under src/pages/, endpoints excluded. */
function pageFiles(): string[] {
	return [...new Glob("**/*.{astro,md}").scanSync(`${ROOT}src/pages`)].sort();
}

describe("the page registry", () => {
	test("covers every page the build emits", () => {
		const built = pageFiles().map(routeFor).sort();
		const registered = PAGES.map((page) => page.path).sort();
		expect(registered).toEqual(built);
	});

	test("declares a twin source or an explicit opt-out for each page", () => {
		for (const page of PAGES) {
			// `source: null` is the opt-out. Anything else must resolve to a
			// file that exists, or the twin silently disappears from the build.
			if (page.source === null) continue;
			expect(() => readFileSync(`${ROOT}${page.source?.file.slice(1)}`, "utf8")).not.toThrow();
		}
	});

	test("has unique paths and non-empty metadata", () => {
		expect(new Set(PAGES.map((page) => page.path)).size).toBe(PAGES.length);
		for (const page of PAGES) {
			expect(page.path.startsWith("/")).toBe(true);
			expect(normalizePath(page.path)).toBe(page.path);
			expect(page.title.length).toBeGreaterThan(0);
			expect(page.description.length).toBeGreaterThan(0);
		}
	});

	test("derives twin URLs and route params consistently", () => {
		for (const page of TWINNED_PAGES) {
			expect(markdownPathFor(page.path)).toBe(`/${markdownRouteParam(page.path)}.md`);
			expect(pageForPath(page.path)).toBe(page);
			expect(pageForPath(`${page.path === "/" ? "/" : `${page.path}/`}`)).toBe(page);
		}
	});

	test("keeps public prose free of em dashes", () => {
		for (const page of PAGES) {
			expect(page.title).not.toContain("—");
			expect(page.description).not.toContain("—");
		}
	});
});

describe("wrangler.jsonc", () => {
	const config = readFileSync(`${ROOT}wrangler.jsonc`, "utf8");

	test("routes exactly the negotiating pages and the API through the Worker", () => {
		const match = /"run_worker_first"\s*:\s*(\[[^\]]*\])/.exec(config);
		expect(match).not.toBeNull();
		const configured = JSON.parse(match?.[1] as string) as string[];
		expect(configured).toEqual(workerFirstRoutes());
	});

	test("never uses the `true` form, which would bill every asset request", () => {
		expect(config).not.toMatch(/"run_worker_first"\s*:\s*true/);
	});

	test("leaves hashed asset paths asset-first", () => {
		for (const route of workerFirstRoutes()) {
			expect(route.startsWith("/_astro")).toBe(false);
		}
	});
});
