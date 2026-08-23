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

- Only well-formed armored age messages are accepted; anything else is
  rejected. The Worker can never see or forward plaintext.
- No persistence, no logs, no observability. `console.*` is banned in
  `src/worker/` and `observability.enabled` stays `false`.
- The client IP is never read and never passed to Turnstile's `siteverify`
  (`remoteip` is deliberately omitted).
- Email subjects carry only a coarse `YYYY-MM` date, no timestamps.

## Wrangler auth (IMPORTANT)

All wrangler commands against this account must be run with explicit
credentials from 1Password (fish syntax):

```fish
env CLOUDFLARE_API_TOKEN=(op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/api_token") CLOUDFLARE_ACCOUNT_ID=(op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/account_id") bunx wrangler ...
```

**NEVER use `wrangler login`**: the OAuth credentials stored on this machine
belong to a different account (Kairos) and must not be touched or shadowed.
Below, `cfwrangler` stands for the full `env CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... bunx wrangler` invocation.

## Runbook: first deploy (workers.dev)

Run from the repo root.

### 1. Onboard agucova.dev to Email Sending

```fish
cfwrangler email sending enable agucova.dev
# Verify the SPF/DKIM DNS records it created:
cfwrangler email sending dns get agucova.dev
cfwrangler email sending list
```

DNS usually propagates within 5–15 minutes.

### 2. Verify agucova@gmail.com as a destination address (if needed)

The `send_email` binding restricts destinations to `agucova@gmail.com`. If
sends fail with `E_RECIPIENT_NOT_ALLOWED` or the destination isn't verified:

```fish
cfwrangler email routing addresses create agucova@gmail.com
# Click the verification link Cloudflare emails to that address, then:
cfwrangler email routing addresses list
```

### 3. Create the real Turnstile widget

Dashboard: **Turnstile → Add widget** → hostname `agucova.dev` (plus the
workers.dev hostname if testing there), mode **Managed** (the form renders
it with `appearance=interaction-only`, so it stays invisible unless a
challenge is required). Or via API:

```fish
curl -X POST "https://api.cloudflare.com/client/v4/accounts/"(op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/account_id")"/challenges/widgets" \
  -H "Authorization: Bearer "(op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/api_token") \
  -H "Content-Type: application/json" \
  -d '{"name": "feedback", "domains": ["agucova.dev"], "mode": "managed"}'
```

The response contains `sitekey` and `secret`.

### 4. Set the Turnstile secret on the Worker

```fish
cfwrangler secret put TURNSTILE_SECRET
# paste the widget secret when prompted
```

(Locally, `.dev.vars` holds the dummy always-pass secret instead.)

### 5. Swap the real Turnstile sitekey in the site

In [`src/lib/feedback/config.ts`](src/lib/feedback/config.ts), set
`TURNSTILE_SITE_KEY` to the real widget sitekey from step 3.

`AGE_RECIPIENT` is already the real public key. The matching decryption
secret lives only in 1Password at
`op://Private/zba2amz2hrfsjc3zbfgq7776zq/age_feedback_key`; to decrypt a
received message:

```fish
op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/age_feedback_key" | age -d -i - message.age
```

### 6. Build and deploy

```fish
bun run build
cfwrangler deploy
```

Smoke test on the workers.dev URL, then decrypt the received email:

```fish
op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/age_feedback_key" | age -d -i - message.age
```

## Runbook: domain cutover from Pages

Once the Worker looks good on workers.dev:

1. In the dashboard, remove the custom domain `agucova.dev` from the old
   Pages project.
2. Add `agucova.dev` as a **Custom Domain** on the `agucova-dev` Worker
   (Worker → Settings → Domains & Routes).
3. Leave the `agus.sh` redirect untouched.
4. Add the `/feedback` link to the nav in
   [`src/layouts/Layout.astro`](src/layouts/Layout.astro), replacing the
   Admonymous link, and redeploy.
5. Disable the Pages Git integration (or delete the Pages project) so
   pushes to `main` stop deploying the old copy.

Notes:

- `public/_headers` and `public/_redirects` carry over: Workers static
  assets supports both files, same as Pages.
- CI only checks and builds; deploys stay manual (`cfwrangler deploy`)
  for now.

## Local development

```fish
cp .dev.vars.example .dev.vars   # dummy always-pass Turnstile secret
bun run build                    # wrangler serves assets from dist/
bunx wrangler dev                # local-only; no Cloudflare auth needed
```

`wrangler dev` serves the built site and the API together. In local dev,
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
