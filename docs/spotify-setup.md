# Spotify now-playing setup

`GET /api/now-playing` reports what I'm listening to: the currently playing
track when there is one, otherwise the most recently played track. It backs
the "liveness" line in the site redesign.

- Handler: [`src/worker/now-playing.ts`](../src/worker/now-playing.ts)
- Route: registered in [`src/worker/index.ts`](../src/worker/index.ts)
- Auth helper: [`scripts/spotify-auth.ts`](../scripts/spotify-auth.ts)
- Cache: the `NOW_PLAYING` KV namespace in [`wrangler.jsonc`](../wrangler.jsonc)

## Response contract

Always `200 application/json`, with `cache-control: public, max-age=30`:

```jsonc
// something is playing
{ "playing": true, "track": "Blue Monday", "artist": "New Order",
  "album": "Substance", "url": "https://open.spotify.com/track/..." }

// nothing live, so the last thing played
{ "playing": false, "track": "Ceremony", "artist": "New Order",
  "album": "Substance", "url": "https://open.spotify.com/track/...",
  "playedAt": "2026-08-22T18:04:05.123Z" }

// nothing to report
{ "playing": false }
```

`album` is omitted for podcast episodes (the show name lands in `artist`).
`playedAt` is only present when `playing` is `false`.

The endpoint never returns 5xx to visitors. Missing secrets, a revoked
refresh token, a Spotify outage, a malformed payload and KV failures all
degrade to `{ "playing": false }` with a 200, so callers have exactly one
failure mode to handle.

## 1. Create the Spotify app

1. Sign in at <https://developer.spotify.com/dashboard> with the Spotify
   account whose listening history should be shown, and click **Create app**.
2. Name and description: anything (for example `agucova.dev now playing`).
3. **Redirect URI**: `http://127.0.0.1:8888/callback` — exactly this. Spotify
   rejects `localhost` but does allow the loopback IP over plain HTTP, and it
   is what `scripts/spotify-auth.ts` listens on. Click **Add** so it appears
   in the list before saving.
4. **Which API/SDKs are you planning to use**: Web API.
5. Save, then open **Settings** and copy the **Client ID** and **Client
   secret**.

The app can stay in development mode: the only user it ever acts for is the
owner of the account that authorizes it in step 2.

## 2. Get a refresh token

The Worker authenticates with the authorization-code refresh flow, so it
needs a refresh token once. That handshake requires a browser, so it happens
locally rather than in the Worker:

```fish
bun run scripts/spotify-auth.ts --client-id <client id> --client-secret <client secret>
```

The script starts a listener on `http://127.0.0.1:8888/callback`, opens the
Spotify consent page (scopes `user-read-currently-playing` and
`user-read-recently-played`, nothing else), exchanges the returned code, and
prints the refresh token. It does not expire, so treat it like a password.

Add `--port <n>` if 8888 is taken, and register the matching redirect URI on
the Spotify app first. `--no-open` prints the authorization URL instead of
opening a browser tab.

If Spotify's consent page says `client_id: Invalid`, the id passed to the
script does not match a real app: check for a stray space, and make sure it
is the **Client ID** rather than the client secret.

## 3. Store the credentials

Keep all three next to the site's other secrets in 1Password, in item
`op://Private/zba2amz2hrfsjc3zbfgq7776zq`:

- `spotify_client_id`
- `spotify_client_secret`
- `spotify_refresh_token`

Then set them as Worker secrets. `cfwrangler` stands for the full
credentialed invocation from [DEPLOY.md](../DEPLOY.md); never
`wrangler login`.

```fish
op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/spotify_client_id" | cfwrangler secret put SPOTIFY_CLIENT_ID
op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/spotify_client_secret" | cfwrangler secret put SPOTIFY_CLIENT_SECRET
op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/spotify_refresh_token" | cfwrangler secret put SPOTIFY_REFRESH_TOKEN
```

Until all three are set, the endpoint answers `{ "playing": false }`. It
never returns an error about being unconfigured, so check
`cfwrangler secret list` if the line stays blank.

## 4. KV namespace (DONE)

The cache namespace already exists on the account and is wired into
`wrangler.jsonc`:

```
binding NOW_PLAYING, id 9cc79d836a0d48dd945e49e8f805acd6
```

Created with (do not redo):

```fish
env CLOUDFLARE_API_TOKEN=(op read "op://Private/zba2amz2hrfsjc3zbfgq7776zq/api_token") CLOUDFLARE_ACCOUNT_ID=d2fe37c02a1d31f3239f9c30c8907db7 bunx wrangler kv namespace create NOW_PLAYING
```

It holds two keys, neither of them visitor data:

- `response:v1` — the shaped JSON, fresh for 45 seconds. Every visitor gets
  this same body, so Spotify sees roughly one request per 45 seconds no
  matter how much traffic the site takes.
- `token:v1` — the current Spotify access token, held until a minute before
  it expires (Spotify issues them with a one hour life).

Both entries carry a 60 second minimum `expirationTtl` because that is KV's
floor; the shorter freshness window is enforced by a timestamp inside the
entry.

## 5. Local development

`.dev.vars` (gitignored) feeds `wrangler dev`. Real credentials work; so do
fake ones, which is the fastest way to confirm the degradation path:

```
SPOTIFY_CLIENT_ID=fake-client-id
SPOTIFY_CLIENT_SECRET=fake-client-secret
SPOTIFY_REFRESH_TOKEN=fake-refresh-token
```

```fish
bun run build
bunx wrangler dev
curl -i http://localhost:8787/api/now-playing
```

With fake credentials Spotify rejects the token exchange and the endpoint
answers `200 {"playing":false}`. With real ones it answers with a track.

`wrangler dev` uses a local KV simulation under `.wrangler/`, so cached
responses persist between restarts. Delete `.wrangler/state` to start clean.

Unit tests (`bun test`) cover the shaping and the failure modes with a
stubbed fetch, so they never touch Spotify:
[`tests/now-playing.test.ts`](../tests/now-playing.test.ts).

## Privacy and logging

The Worker's no-logging rule applies here as it does to `/api/feedback`: no
`console.*` in `src/worker/`, and `observability.enabled` stays `false` in
`wrangler.jsonc`. This endpoint reads nothing about the visitor (no IP, no
headers, no body) and stores nothing per visitor, so the KV cache does not
weaken the feedback endpoint's guarantees.

## Rotating or revoking

- Revoke everything at <https://www.spotify.com/account/apps/> (removes the
  app's access to the account, invalidating the refresh token).
- Rotating the client secret in the dashboard also invalidates the refresh
  token: re-run `scripts/spotify-auth.ts` and set all three secrets again.
- After any of the above, the endpoint quietly falls back to
  `{ "playing": false }` rather than erroring.
