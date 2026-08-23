# Deploying agucova.dev

The site is a single Cloudflare Worker (`agucova-dev`) that serves the
static Astro build from `dist/` and handles dynamic endpoints — currently
the anonymous feedback relay at `POST /api/feedback`
([`src/worker/`](src/worker/)). Configuration lives in
[`wrangler.jsonc`](wrangler.jsonc).

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
  (FontAwesome, SavvyCal, analytics beacon) may share the DOM with the
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

### 3. Smoke test on workers.dev

Submit through `https://agucova-dev.agucova.workers.dev/feedback`, check
the Gmail inbox, and decrypt:

```fish
op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/age_feedback_key" | age -d -i - message.age
```

### 4. Domain cutover from Pages

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

Type checking: `bun run check:worker`. Tests (age round-trip + armor
validation): `bun test`.
