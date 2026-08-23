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

	test("reuses each page's own meta description as its llms.txt note", () => {
		for (const file of pageFiles()) {
			const source = readFileSync(`${ROOT}src/pages/${file}`, "utf8");
			// .astro pages declare it as a const, .md pages in frontmatter.
			// The Exiliada page writes the tag by hand and is skipped.
			const declared = /^(?:const description = |description: )"([^"]+)";?$/m.exec(source);
			if (declared === null) continue;
			expect(pageForPath(routeFor(file))?.description).toBe(declared[1] as string);
		}
	});

	test("keeps public prose free of em dashes", () => {
		for (const page of PAGES) {
			expect(page.title).not.toContain("—");
			expect(page.description).not.toContain("—");
		}
	});
});

/**
 * The twins of the .astro pages are hand written, so they are the only ones
 * that can drift from the page they mirror. Key material and fingerprints
 * are the part where drift is actively harmful, so they are pinned here: a
 * key rotated in the page fails the build until the twin follows.
 */
describe("hand-authored twins", () => {
	function read(path: string): string {
		return readFileSync(`${ROOT}${path}`, "utf8");
	}

	test("/keys.md carries the same key material as keys.astro", () => {
		const page = read("src/pages/keys.astro");
		const twin = read("src/content/twins/keys.md");

		const constants = [...page.matchAll(/^const [A-Z_]+ = "([^"]+)";$/gm)].map((match) => match[1] as string);
		expect(constants.length).toBeGreaterThan(0);
		for (const value of constants) {
			expect(twin).toContain(value);
		}
	});

	test("/pgp.md carries the same fingerprint as pgp.astro", () => {
		const fingerprint = /(?:[0-9A-F]{4} ){9}[0-9A-F]{4}/.exec(read("src/pages/pgp.astro"));
		expect(fingerprint).not.toBeNull();
		expect(read("src/content/twins/pgp.md")).toContain(fingerprint?.[0] as string);
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
