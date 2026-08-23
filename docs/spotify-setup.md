# Spotify now-playing setup

`GET /api/now-playing` reports what I'm listening to: the currently playing
track when there is one, otherwise the most recently played track. It backs
the "liveness" line in the site redesign.

- Handler: [`src/worker/now-playing.ts`](../src/worker/now-playing.ts)
- Route: registered in [`src/worker/index.ts`](../src/worker/index.ts)
- Auth helper: [`scripts/spotify-auth.ts`](../scripts/spotify-auth.ts)
- Ghost mode switch: [`scripts/ghost.ts`](../scripts/ghost.ts)
- Cache: the `NOW_PLAYING` KV namespace in [`wrangler.jsonc`](../wrangler.jsonc)

Music only: podcast episodes are excluded everywhere. A live episode counts
as "nothing playing" and falls through to the most recent music track, and
no show name can reach any field. (Spotify's recently-played endpoint
returns tracks only, so the history needs no filtering.)

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

`album` is omitted when Spotify does not supply one. `playedAt` is only
present when `playing` is `false`, and stays a precise ISO timestamp: a
future UI decides how to phrase it.

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

Better: pass `--op-item` and the token never reaches the terminal at all.

```fish
bun run scripts/spotify-auth.ts --op-item zba2amz2hrfsjc3zbfgq7776zq
```

In that mode the script reads `spotify_client_id` and `spotify_client_secret`
from the item (so neither credential appears in shell history either), and
on success writes the result straight back into the same item as
`spotify_refresh_token`, a concealed field. It prints only a confirmation.
Explicit `--client-id` / `--client-secret` flags still win if you pass them.

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
- `spotify_refresh_token` (already written by step 2 if you used `--op-item`)

Then set them as Worker secrets. Piping straight from `op` keeps the values
out of the terminal and out of shell history. `cfwrangler` stands for the full
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

It holds four keys, none of them visitor data:

- `response:v1` — the shaped JSON, fresh for 45 seconds. Every visitor gets
  this same body, so Spotify sees roughly one request per 45 seconds no
  matter how much traffic the site takes.
- `token:v1` — the current Spotify access token, held until a minute before
  it expires (Spotify issues them with a one hour life).
- `last:v1` — the most recent music track ever shaped, with its real ISO
  timestamp (for a live track, the moment it was observed). Written with no
  TTL, because ghost mode may need to serve it months later.
- `ghost:v1` — the ghost mode switch, described below. Absent means off.

The first two carry a 60 second minimum `expirationTtl` because that is KV's
floor; the shorter freshness window is enforced by a timestamp inside the
entry.

## Ghost mode

Ghost mode stops the endpoint reporting activity, for travel or any other
time the liveness line should not be a presence signal.

```fish
bun run scripts/ghost.ts on      # stop reporting
bun run scripts/ghost.ts off     # resume
bun run scripts/ghost.ts status  # check
```

Add `--local` to any of those to drive the KV simulation `wrangler dev` uses
instead of the deployed namespace.

While it is on:

- The Worker makes **no Spotify API call at all**. Not a token refresh, not
  a playback read. There is no request pattern to observe, and nothing about
  the ghost period is written to KV either.
- The endpoint serves `last:v1` — the last track seen before the switch —
  as a normal `"playing": false` response, carrying that track's original
  timestamp.
- Same status code, same headers, same `cache-control` as always.

That entry then ages on its own, which is the point: an observer sees a
track that was played at a real time and has not changed since, which is
exactly what someone who stopped listening after that song looks like.
Turning ghost mode on is therefore not observable from outside. Nothing
announces the transition, and there is no "ghost" marker in the response.

If `last:v1` has never been written, the endpoint answers `{"playing":
false}`.

Switching on also deletes `response:v1`, so a live answer cached seconds
earlier cannot outlive the flag. Switching off deletes it too, so normal
reporting resumes on the very next request.

One deliberate failure choice: if the Worker cannot read the flag at all (a
KV failure), it behaves as though ghost mode were **on**. Staying quiet
during an outage is both the private answer and an unremarkable one, whereas
guessing "off" could publish activity that was meant to be hidden.

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

To go quiet without touching any credential, use ghost mode instead: it is
reversible, leaves the Spotify app alone, and looks like nothing happened.
