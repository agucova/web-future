/**
 * The single registry of pages the site publishes, and of the markdown twin
 * (if any) that each one has.
 *
 * Three things read this file, which is the whole point of it existing:
 *   - `src/pages/[...page].md.ts` emits `dist/<path>.md` for every entry that
 *     has a twin source.
 *   - `src/pages/llms.txt.ts` emits the site index at /llms.txt.
 *   - `src/worker/negotiate.ts` decides, per request, whether to serve the
 *     HTML page or its twin, and which `Link` header to advertise.
 *
 * Because both sides read the same list, the Worker never has to probe for a
 * `.md` sibling and the two can never disagree: a page with no entry has no
 * twin, no `Link` header and no llms.txt line, everywhere at once.
 *
 * This module is imported by the Worker, so it must stay pure data plus
 * plain functions: no DOM, no Node, no Astro, no Vite-only syntax.
 */

/** Where a page's markdown twin comes from. */
export type TwinSource =
	/** A `.md` page under src/pages/. The twin is its body, frontmatter stripped. */
	| { readonly kind: "page"; readonly file: string }
	/**
	 * A markdown fragment rendered inside an `.astro` page. The twin is the
	 * page's `<h1>` followed by the fragment, verbatim.
	 */
	| { readonly kind: "fragment"; readonly file: string; readonly heading: string }
	/** A hand-authored twin for a page whose markup has no markdown source. */
	| { readonly kind: "twin"; readonly file: string };

export interface PageEntry {
	/** Site path, without a trailing slash. The root is `/`. */
	readonly path: string;
	/** Page title, used as the link text in llms.txt. */
	readonly title: string;
	/** The page's own meta description, reused as the llms.txt note. */
	readonly description: string;
	/** `null` means the page is HTML only and has no twin. */
	readonly source: TwinSource | null;
}

export const SITE_URL = "https://agucova.dev";

/**
 * Every route the build emits. Adding a page without adding it here fails
 * `tests/agents-pages.test.ts`; declaring `source: null` is the explicit
 * opt-out for pages that cannot be represented as markdown.
 */
export const PAGES: readonly PageEntry[] = [
	{
		path: "/",
		title: "Home",
		description:
			"👨‍💻 A professional community builder and software engineer that does a bit of everything, but nothing specially well.",
		source: { kind: "fragment", file: "/src/content/home.md", heading: "Hi there, I'm Agus 👋" },
	},
	{
		path: "/now",
		title: "What I'm currently up to",
		description: "⏰ A list of the things I'm currently doing, updated periodically.",
		source: { kind: "page", file: "/src/pages/now.md" },
	},
	{
		path: "/where",
		title: "Where I am",
		description: "The city I am in, published as a DNS LOC record you can check with dig.",
		source: { kind: "twin", file: "/src/content/twins/where.md" },
	},
	{
		path: "/uses",
		title: "What I use",
		description: "👨‍💻 The things I use as part of my daily workflow.",
		source: { kind: "page", file: "/src/pages/uses.md" },
	},
	{
		path: "/pgp",
		title: "PGP",
		description: "🔐 How to reach me securely, audit my public identity and find my PGP keys.",
		source: { kind: "twin", file: "/src/content/twins/pgp.md" },
	},
	{
		path: "/keys",
		title: "Keys",
		description:
			"My public keys: age for encryption, SSH for signatures, Ariadne for identity, PGP for compatibility.",
		source: { kind: "twin", file: "/src/content/twins/keys.md" },
	},
	{
		path: "/feedback",
		title: "Feedback",
		description: "Send me anonymous, end-to-end encrypted feedback.",
		source: { kind: "twin", file: "/src/content/twins/feedback.md" },
	},
	{
		// An interactive map, audio player and synchronised poem. A flattened
		// markdown version would describe a different artifact than the one
		// that is actually served, so this page is declared HTML only.
		path: "/projects/exiliada-del-sur",
		title: "La Exiliada del Sur",
		description:
			"Una visualización interactiva de 'La Exiliada del Sur' de Violeta Parra, interpretada por Inti Illimani. Explora el recorrido a través del sur de Chile.",
		source: null,
	},
];

/** Entries that have a twin, in registry order. */
export const TWINNED_PAGES: readonly PageEntry[] = PAGES.filter((page) => page.source !== null);

/**
 * The URL of a page's twin: `/now` becomes `/now.md`, and the root becomes
 * `/index.md`. This is the llms.txt spec's "extension replaced by .md" form,
 * and it gives every representation a stable URL of its own.
 */
export function markdownPathFor(path: string): string {
	return path === "/" ? "/index.md" : `${path}.md`;
}

/**
 * The `[...page]` route parameter behind a twin URL: `/index.md` is built
 * from `index`, `/projects/x.md` from `projects/x`.
 */
export function markdownRouteParam(path: string): string {
	return markdownPathFor(path).slice(1, -".md".length);
}

/** Trailing slashes are equivalent to their absence (`trailingSlash: 'never'`). */
export function normalizePath(pathname: string): string {
	if (pathname.length > 1 && pathname.endsWith("/")) {
		return pathname.slice(0, -1);
	}
	return pathname === "" ? "/" : pathname;
}

/** The registry entry serving a request path, or `null` if there is none. */
export function pageForPath(pathname: string): PageEntry | null {
	const normalized = normalizePath(pathname);
	return PAGES.find((page) => page.path === normalized) ?? null;
}

/**
 * The `assets.run_worker_first` list for wrangler.jsonc.
 *
 * Only pages that actually negotiate are listed, plus the API. Everything
 * else (hashed /_astro/* chunks, images, css, the standalone .md twins) stays
 * asset-first, so it neither costs a Worker invocation nor puts the Worker on
 * the critical path for static bytes. `tests/agents-pages.test.ts` asserts
 * that wrangler.jsonc still matches this.
 */
export function workerFirstRoutes(): string[] {
	return [...TWINNED_PAGES.map((page) => page.path), "/api/*"];
}
