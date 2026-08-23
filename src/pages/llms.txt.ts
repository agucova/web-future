/**
 * /llms.txt, generated from the page registry so it cannot drift.
 *
 * Structure follows llmstxt.org: an H1, a blockquote summary, free-form
 * markdown, then H2 sections of `[name](url): note` link lists. Notes are
 * each page's own meta description.
 *
 * There is deliberately no llms-full.txt: the site is a handful of short
 * pages, so this file plus the twins is full coverage in two fetches, and a
 * concatenated copy would be one more thing to keep in sync.
 */
import type { APIRoute } from "astro";

import { PAGES, SITE_URL, markdownPathFor, type PageEntry } from "$lib/agents/pages";

const TITLE = "Agustín Covarrubias";

/** Reused verbatim from the site's own meta description. */
const SUMMARY =
	"👨‍💻 A professional community builder and software engineer that does a bit of everything, but nothing specially well.";

const NOTES = [
	"Every page listed below has a markdown twin at the same path with `.md`.",
	"Any page URL also returns markdown to a request sending `Accept: text/markdown`.",
];

function link(page: PageEntry, url: string, suffix = ""): string {
	return `- [${page.title}](${url}): ${page.description}${suffix}`;
}

function render(): string {
	const twinned = PAGES.filter((page) => page.source !== null);
	const htmlOnly = PAGES.filter((page) => page.source === null);

	const lines = [`# ${TITLE}`, "", `> ${SUMMARY}`, "", ...NOTES, "", "## Pages", ""];

	for (const page of twinned) {
		lines.push(link(page, `${SITE_URL}${markdownPathFor(page.path)}`));
	}

	if (htmlOnly.length > 0) {
		lines.push("", "## Interactive pages", "");
		for (const page of htmlOnly) {
			lines.push(link(page, `${SITE_URL}${page.path}`, " (HTML only, no markdown twin)"));
		}
	}

	return `${lines.join("\n")}\n`;
}

export const GET: APIRoute = () =>
	new Response(render(), {
		headers: { "content-type": "text/plain; charset=utf-8" },
	});
