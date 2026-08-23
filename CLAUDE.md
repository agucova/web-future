# CLAUDE.md

Personal website (agucova.dev). Astro 5 static site with Svelte 5 islands and Tailwind 4. Package manager is bun (never npm/yarn).

## Commands
- Install: `bun install`
- Dev server: `bun run dev`
- Build: `bun run build` (output in `dist/`)
- Type check: `bunx astro check`
- Preview build: `bun run preview`

## Project Structure
- `src/pages/`: Routes (`.astro` and `.md` pages)
- `src/layouts/`: Shared page layouts
- `src/components/`: Svelte components
- `src/lib/`: TypeScript modules (aliased as `$lib`)
- `src/styles/`: Global and page-specific CSS
- `src/content/`: Markdown content fragments
- `public/`: Static assets, copied verbatim to `dist/`
- `astro.config.mjs`: Astro configuration

## Deployment
- Cloudflare Pages via Git integration: every push to `main` deploys.
- Do not push unless the change is meant to go live.

## Conventions
- Conventional commits (feat:/fix:/docs:/style:/refactor:/chore:/ci:)
- CI (GitHub Actions) runs `bunx astro check` and `bun run build` on pushes to main and PRs.
- Keep HTML minimal and semantic; maintain accessibility standards.
