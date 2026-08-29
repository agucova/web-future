# Deploying agucova.dev

The site is a single Cloudflare Worker (`agucova-dev`) that serves the
static Astro build from `dist/` and handles dynamic endpoints — the
anonymous feedback relay at `POST /api/feedback`, the Spotify liveness
endpoint at `GET /api/now-playing` and the where-am-I endpoint at
`GET /api/where` ([`src/worker/`](src/worker/)).
Configuration lives in [`wrangler.jsonc`](wrangler.jsonc).

The feedback endpoint receives age-encrypted (armored) messages from
[`/feedback`](src/pages/feedback.astro), verifies a Turnstile token, and
forwards the **ciphertext only** by email to `agucova@gmail.com` via the
Email Service `send_email` binding. (This is why the site is a Worker
rather than Pages Functions — Pages Functions don't support `send_email`.)

## Privacy invariants (feedback endpoint)

- Only well-formed armored age messages are accepted (envelope grammar plus
  the `age-encryption.org/v1` file magic); anything else is rejected. The
  Worker can never see or forward readable plaintext.
- No persistence, no logs, no observability. `console.*` is banned in
  `src/worker/` and `observability.enabled` stays `false`.
- The client IP is never read and never passed to Turnstile's `siteverify`
  (`remoteip` is deliberately omitted).
- Email subjects carry only a coarse `YYYY-MM` date. (Transport headers
  still reveal arrival time; the form discloses this to senders.)
- `/feedback` renders with the `minimal` layout: no third-party scripts
  (FontAwesome, analytics beacon) may share the DOM with the
  plaintext textarea, and no pageview of it lands in analytics. A stricter
  path-scoped CSP in `public/_headers` enforces this.

Operational corollaries — things that would silently break the invariants:

- Never enable Workers observability/logs for this Worker.
- `wrangler tail` streams live invocation events even with observability
  off. Don't leave it running against this Worker; treat any use as
  temporarily suspending the "no logs" guarantee.
- After the domain cutover, keep zone-level recording off this path: no
  Logpush/Instant Logs jobs covering `/api/feedback`, and be aware that WAF
  or Bot Fight Mode "Security Events" log client IPs for matched requests.

## Markdown twins and content negotiation

Every page except the interactive Exiliada piece is published twice: as HTML
at its own URL, and as markdown at the same path with `.md`
(`/now` and `/now.md`, the root's twin being `/index.md`). A request that
sends `Accept: text/markdown` on a page URL gets the twin; everyone else gets
the HTML, with a `Link: </now.md>; rel="alternate"; type="text/markdown"`
header pointing at it. `/llms.txt` indexes the lot.

[`src/lib/agents/pages.ts`](src/lib/agents/pages.ts) is the single registry
behind all of it: the twin emitter
([`src/pages/[...page].md.ts`](src/pages/%5B...page%5D.md.ts)), `/llms.txt`,
the `<link rel="alternate">` tags in `Layout.astro`, the Worker's
negotiation ([`src/worker/negotiate.ts`](src/worker/negotiate.ts)) and the
`run_worker_first` list all read it. Adding a page without registering it
fails `bun test`.

### Routing

```jsonc
"run_worker_first": ["/", "/now", "/uses", "/pgp", "/keys", "/feedback", "/api/*"]
```

This must stay an **array, never `true`**. Without it the asset server would
answer page requests directly and the negotiation would never run; with
`true` every `/_astro/*` chunk, stylesheet and image would become a billed
Worker invocation on the critical path for static bytes. Verified locally:
15 asset requests produced 0 Worker invocations, 3 page requests produced 3.

`html_handling` is set to `drop-trailing-slash` to match Astro's
`trailingSlash: 'never'`. The asset server's default would make `/now/` the
canonical URL and redirect `/now` to it, which contradicts every canonical
link the site emits and would land agents on a path that is not Worker-first
and therefore never negotiates.

### The cache trap (read before touching cache settings)

Cloudflare's edge ignores `Vary` on everything except `Accept-Encoding`. Two
representations under one URL therefore share a cache key, and a cached
markdown response would be served to browsers (and a cached HTML response to
agents).

- Negotiated page URLs answer with
  `Cache-Control: public, max-age=0, must-revalidate` plus `Vary: Accept`.
  The Worker runs on every page request; the `ASSETS.fetch` behind it is
  cheap and edge-local, which at this traffic volume is the right trade.
- The standalone `.md` URLs are a single representation each and are served
  asset-first, so they cache normally.
- **Do not** add a "cache everything" Cache Rule, a Tiered Cache or an Edge
  TTL override covering `/`, `/now`, `/uses`, `/pgp`, `/keys` or
  `/feedback`. If one is ever wanted, it needs a custom cache key with a
  normalized `Accept` dimension (`html` or `md`, never the raw header),
  which is a paid-plan feature. Enabling one without that quietly serves
  markdown to browsers.

### Privacy

Negotiation reads exactly one request header, `Accept`, and records nothing.
Note that "nothing is persisted" is a per-endpoint invariant now rather than
a Worker-wide one: `/api/now-playing` writes its Spotify cache to the
`NOW_PLAYING` KV namespace and `/api/where` its disclosure flag and DNS
answer cache to `WHERE` (neither holds visitor data), while `/api/feedback`
and the negotiation path persist nothing at all.

## Wrangler auth (IMPORTANT)

All wrangler commands against this account must be run with explicit
credentials from 1Password (fish syntax):

```fish
env CLOUDFLARE_API_TOKEN=(op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/api_token") CLOUDFLARE_ACCOUNT_ID=(op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/account_id") bunx wrangler ...
```

**NEVER use `wrangler login`**: the OAuth credentials stored on this machine
belong to a different account (Kairos) and must not be touched or shadowed.
Below, `cfwrangler` stands for the full `env CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... bunx wrangler` invocation.

## Account-side setup (DONE)

Already completed on the account — do not redo:

- **Email Sending enabled for agucova.dev**: SPF/DKIM/bounce DNS records
  are live, no conflicts.
- **agucova@gmail.com verified** as an Email Routing destination address.
- **Turnstile widget created**: mode `managed`, valid for `agucova.dev` and
  `agucova.workers.dev`. The sitekey is baked into
  [`src/lib/feedback/config.ts`](src/lib/feedback/config.ts); the secret is
  stored at `op://Private/zba2amz2hrfsjc3zbfgq7776zq/turnstile_secret`.
- **age keypair generated**: the public recipient is baked into config.ts;
  the decryption secret lives only at
  `op://Private/zba2amz2hrfsjc3zbfgq7776zq/age_feedback_key`.
- **`NOW_PLAYING` KV namespace created**: id
  `9cc79d836a0d48dd945e49e8f805acd6`, already wired into `wrangler.jsonc`.
  It caches the `/api/now-playing` response and Spotify access token, and
  holds no visitor data (see [docs/spotify-setup.md](docs/spotify-setup.md)).
- **`WHERE` KV namespace created**: id
  `5b823210670b45859e1295ca5c221faf`, already wired into `wrangler.jsonc`.
  It holds the location disclosure flag and the cached DNS answer behind
  `/api/where`, and no visitor data (see
  [docs/where-setup.md](docs/where-setup.md)). Deliberately a different
  namespace from `NOW_PLAYING`: the location switch is opt-in and the Spotify
  ghost switch is opt-out, and neither may be able to reach the other's key.

## Remaining deploy steps

Run from the repo root.

### 1. Build and deploy the Worker

```fish
bun run build
cfwrangler deploy
```

The Worker lands at `agucova-dev.agucova.workers.dev` (the account's
workers.dev subdomain is `agucova`, which the Turnstile widget already
allows).

### 2. Set the Turnstile secret

```fish
op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/turnstile_secret" | cfwrangler secret put TURNSTILE_SECRET
```

(Until this is set, submissions fail closed with 403.)

### 3. Set the Spotify secrets (now playing)

`GET /api/now-playing` needs a Spotify developer app and a one-time OAuth
handshake before it reports anything. The full walkthrough (app creation,
`scripts/spotify-auth.ts`, the KV cache, local testing) is in
[docs/spotify-setup.md](docs/spotify-setup.md). Once the credentials are in
1Password:

```fish
op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/spotify_client_id" | cfwrangler secret put SPOTIFY_CLIENT_ID
op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/spotify_client_secret" | cfwrangler secret put SPOTIFY_CLIENT_SECRET
op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/spotify_refresh_token" | cfwrangler secret put SPOTIFY_REFRESH_TOKEN
```

This one fails open, not closed: until the secrets are set the endpoint
answers `200 {"playing":false}` and the (not yet mounted) UI shows nothing.

To go quiet later without touching the secrets, use ghost mode
(`bun run scripts/ghost.ts on|off|status`): the Worker then makes no Spotify
call at all and keeps serving the last track it saw, unchanged and with its
real timestamp, which from outside is indistinguishable from having stopped
listening. Details in [docs/spotify-setup.md](docs/spotify-setup.md).

### 3b. Publishing a location (optional, off by default)

`GET /api/where` and `/where` need no secrets at all: the Worker resolves the
LOC and TXT records on `agucova.dev` over DNS-over-HTTPS and renders what
comes back. Nothing is published until the CLI is run, and it fails closed on
every doubt.

```fish
bun run scripts/where.ts cities        # the ids `set` accepts
bun run scripts/where.ts set berkeley  # publish, for 14 days
bun run scripts/where.ts status        # flag, records, and what the site shows
bun run scripts/where.ts clear         # stop publishing
```

The CLI needs `Zone > DNS > Edit` on the `agucova.dev` zone in addition to
the Workers KV permission `scripts/ghost.ts` already uses; the token above
has both. Full design notes, including why DNS is the source of truth rather
than a projection of one, are in
[docs/where-setup.md](docs/where-setup.md).

### 4. Smoke test on workers.dev

Submit through `https://agucova-dev.agucova.workers.dev/feedback`, check
the Gmail inbox, and decrypt:

```fish
op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/age_feedback_key" | age -d -i - message.age
```

### 5. Domain cutover from Pages

The legacy Pages project is named `agucova` on account
`d2fe37c02a1d31f3239f9c30c8907db7` and currently owns `agucova.dev` and
`web-future.pages.dev`.

1. In the dashboard, remove the custom domain `agucova.dev` from the
   `agucova` Pages project.
2. Add `agucova.dev` as a **Custom Domain** on the `agucova-dev` Worker
   (Worker → Settings → Domains & Routes).
3. Leave the `agus.sh` redirect untouched.
4. Add the `/feedback` link to the nav in
   [`src/layouts/Layout.astro`](src/layouts/Layout.astro), replacing the
   Admonymous link, and redeploy (`bun run build && cfwrangler deploy`).
5. Disable the Pages Git integration (or delete the `agucova` Pages
   project) so pushes to `main` stop deploying the old copy.

Notes:

- `public/_headers` and `public/_redirects` carry over: Workers static
  assets supports both files, same as Pages.
- CI only checks, tests, and builds; deploys stay manual
  (`cfwrangler deploy`) for now.

## Local development

```fish
cp .dev.vars.example .dev.vars   # dummy always-pass Turnstile secret
bun run build                    # wrangler serves assets from dist/
bunx wrangler dev                # local-only; no Cloudflare auth needed
```

`wrangler dev` serves the built site and the API together. To exercise the
form UI on localhost, temporarily swap `TURNSTILE_SITE_KEY` in config.ts
for the dummy always-pass key `1x00000000000000000000AA` (the real widget
doesn't allow localhost); never commit that swap. In local dev,
`send_email` doesn't send anything: wrangler logs
`send_email binding called with MessageBuilder:` (with From/To/Subject) and
writes the would-be text body to a file under
`.wrangler/tmp/email/miniflare-*/email-text/`. Example request:

```fish
curl -i http://localhost:8787/api/feedback \
  -H 'content-type: application/json' \
  -d '{"ciphertext": "-----BEGIN AGE ENCRYPTED FILE-----\n...\n-----END AGE ENCRYPTED FILE-----", "turnstileToken": "XXXX.DUMMY", "website": ""}'
```

`/api/now-playing` works locally too, against wrangler's local KV
simulation. With the placeholder Spotify values from `.dev.vars.example` the
token exchange fails and the endpoint degrades as designed:

```fish
curl -i http://localhost:8787/api/now-playing
# HTTP/1.1 200 OK
# cache-control: public, max-age=30
# {"playing":false}
```

`/api/where` needs a record to read. Point it at a throwaway name rather
than the apex:

```fish
bun run scripts/where.ts set berkeley --name loc-test --days 3 --local
echo 'WHERE_NAME=loc-test.agucova.dev' >> .dev.vars
curl -s http://localhost:8787/api/where
bun run scripts/where.ts clear --name loc-test --local
```

Markdown negotiation can be exercised the same way:

```fish
curl -sI -H 'Accept: text/markdown' http://localhost:8787/now   # text/markdown
curl -sI -H 'Accept: text/html' http://localhost:8787/now       # html + Link
curl -s  http://localhost:8787/now.md                           # the twin itself
curl -s  http://localhost:8787/llms.txt
```

Type checking: `bun run check:worker`. Tests (age round-trip + armor
validation, now-playing shaping and degradation, Accept negotiation, page
registry and `run_worker_first` drift): `bun test`.
