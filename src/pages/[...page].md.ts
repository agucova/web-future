/**
 * Emits the markdown twin of every registry page that has one:
 * `dist/index.md`, `dist/now.md`, `dist/uses.md`, and so on.
 *
 * The twins are built from the same sources the HTML pages render from, so
 * the two representations cannot say different things. There is deliberately
 * no HTML-to-markdown conversion step: it would add a dependency and produce
 * a flattened, lossy copy of pages that are not articles.
 */
import type { APIRoute, GetStaticPaths } from "astro";

import { TWINNED_PAGES, markdownRouteParam, type TwinSource } from "$lib/agents/pages";

/**
 * Every markdown file in the project, as raw text. `?raw` bypasses Astro's
 * markdown pipeline, so what lands here is exactly what is on disk.
 */
const RAW_MARKDOWN = import.meta.glob<string>("/src/{content,pages}/**/*.md", {
	query: "?raw",
	import: "default",
	eager: true,
});

/** Reads a source file by its registry path, failing the build if it moved. */
function readSource(file: string): string {
	const raw = RAW_MARKDOWN[file];
	if (raw === undefined) {
		throw new Error(`Markdown twin source not found: ${file}. Check src/lib/agents/pages.ts.`);
	}
	return raw;
}

/** Drops the leading YAML frontmatter block of an Astro markdown page. */
function stripFrontmatter(raw: string): string {
	const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(raw);
	return match === null ? raw : raw.slice(match[0].length);
}

/** The twin's body for one registry source. */
function renderTwin(source: TwinSource): string {
	const raw = readSource(source.file);
	switch (source.kind) {
		case "page":
			return stripFrontmatter(raw).trimStart();
		case "fragment":
			// The heading lives in the .astro page rather than the fragment,
			// so the twin restores it to match what the page renders.
			return `# ${source.heading}\n\n${raw.trimStart()}`;
		case "twin":
			return raw.trimStart();
	}
}

export const getStaticPaths = (() =>
	TWINNED_PAGES.map((page) => ({
		params: { page: markdownRouteParam(page.path) },
		props: { body: renderTwin(page.source as TwinSource) },
	}))) satisfies GetStaticPaths;

export const GET: APIRoute<{ body: string }> = ({ props }) =>
	new Response(`${props.body.trimEnd()}\n`, {
		headers: { "content-type": "text/markdown; charset=utf-8" },
	});
