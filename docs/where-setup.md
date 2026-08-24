# Where I am (`/where`, `GET /api/where`, `dig LOC agucova.dev`)

Publishes which city Agus is in, at city resolution, in two places that
cannot disagree: a pair of DNS records on `agucova.dev`, and a page that
renders those records back.

Everything is off by default. Nothing is published until `scripts/where.ts
set` runs, and `clear` puts it back to nothing.

## The shape of it

```
scripts/where.ts  ──writes──▶  agucova.dev  IN LOC  37 52 0.000 N 122 16 0.000 W 0.00m 20000m 20000m 90000000m
                               agucova.dev  IN TXT  "v=where1; since=2026-08-23; until=2026-09-06"
                  ──writes──▶  WHERE kv: disclose:v1 = "on"
                                     │
                                     ▼
                     src/worker/where.ts ──DNS-over-HTTPS──▶ reads both records back
                                     │
                                     ▼
                             GET /api/where  ──▶  /where
```

## Why DNS is the source of truth

The obvious design is to keep the location in KV and write the DNS record as
a projection of it. That was rejected. Two stores holding the same fact can
drift, and when they do, a reader has no way to tell which one is lying: the
page says Berkeley, `dig` says Santiago, and the whole "check it yourself"
premise evaporates at exactly the moment it matters.

So there is no second store. The claim lives in DNS and only in DNS, and the
page is a rendering of a DNS lookup. `dig LOC agucova.dev` and the page are
not two things kept in agreement; they are one thing displayed twice. The
cost is a DNS-over-HTTPS lookup per cache window and a dependency on
`cloudflare-dns.com`, which is the right trade for a page whose entire point
is being checkable.

The city *name* is not in DNS either. The records carry coordinates; the
label is recovered by matching them against
[`src/lib/where/cities.ts`](../src/lib/where/cities.ts), which is in this
repository. So a reader can reproduce the label from the record plus a public
table, and the site cannot render "Berkeley" over coordinates that say
something else. Coordinates matching no city in the table publish nothing.

## Why two records

| record | carries | why it is separate |
| --- | --- | --- |
| `LOC` | the place | RFC 1876 has fields for exactly this, including the coarseness |
| `TXT` | `v=where1; since=…; until=…` | the terms the claim is made under |

Splitting them means the LOC record stays a plain, standard LOC record that
any RFC 1876 tool reads correctly, and the terms stay human-readable in `dig`
output. It also gives the writer a safe ordering: `set` writes LOC then TXT,
`clear` deletes TXT then LOC, and a location with no terms is not published,
so **every partial state is a silent one**.

## Why the precision fields are doing real work

RFC 1876 carries three fields the page could not fake if it wanted to:

- **size** is the diameter of the described entity. It holds the diameter of
  the city, not of a person.
- **horizontal precision** repeats that figure, which is the RFC's own way of
  saying "these coordinates are good to city scale and no further".
- **vertical precision** is set to the maximum the format can express
  (9 x 10^9 cm), which says the altitude field carries no information at all.
  The altitude itself is published as zero.

On top of that, coordinates are rounded to whole arcminutes before anything
reaches DNS, so the seconds field is always `0.000` and the published point
sits on a grid of roughly 1.8 km. The coarseness is therefore visible three
separate ways in the record itself, not only in prose on the page.

The size field can only hold one significant digit (2 x 10^6 cm and so on),
so `sizeMetres` in the city table has to be a figure like `20000` or `60000`.
`tests/where.test.ts` fails on anything that would have to be rounded, rather
than letting the published figure quietly differ from the reviewed one.

## Why it expires

A location set three months ago and never cleared is a lie by omission, and
"remember to clear it" is not a mechanism. So the TXT record carries an
`until` date, and once it passes:

- `GET /api/where` goes quiet on its own, and
- a reader running `dig` sees the same expired date and can draw the same
  conclusion without the site's help.

The default window is 14 days (`--days N` to change it, 1 to 90). The record
may sit in DNS past its expiry; that is not drift, because the record says so
itself. Nothing has to run on a schedule, and the Worker needs no credential
that could edit DNS.

## Why only agucova.dev, not agus.sh

The Ariadne identity proofs are duplicated across both zones, and it is worth
saying why this is not.

Identity proofs are append-only and permanent: a second copy is a second
place to find the same unchanging fact. A location is revocable and
time-boxed: a second copy is a second place that has to be cleared, and the
day the `agus.sh` deletion fails while the `agucova.dev` one succeeds,
`dig LOC agus.sh` keeps answering after the site has gone dark. One record,
one place to clear it. The site is served from `agucova.dev`, so that is
where it lives.

## Privacy invariants

- **Opt-in, and fail closed.** Disclosure requires `disclose:v1` in the
  `WHERE` KV namespace to read exactly `"on"`. A missing key, any other
  value, a malformed value, a KV outage or a missing binding all mean
  silence. The flag is read *before* the cache, so switching it off takes
  effect on the next request rather than at the end of the cache window.
- **Not ghost mode.** This is a different flag, in a different namespace,
  with the opposite default. Spotify's `ghost:v1` is opt-out (absent means
  keep reporting); `disclose:v1` is opt-in (absent means say nothing).
  Neither switch can reach the other's key.
- **City level only.** See the precision section above.
- **Nothing is inferred.** The Worker calls a DNS resolver and nothing else.
  There is no geocoder, no IP lookup, no map tile, and no request attribute is
  read or forwarded. Every visitor gets the identical JSON.
- **No logs.** `console.*` stays banned across `src/worker/`, and
  `observability.enabled` stays `false`.
- **One silent state.** `{ "disclosed": false }` is returned whether the flag
  is off, the records are absent, the terms have expired or the coordinates
  match no city. Visitors do not get to tell those apart.

### The noise policy, and why it has no flag

The standing policy, stated permanently on `/where`, is that the published
location may be stale or simply wrong, on purpose, without being marked.
Declaring that possibility once and permanently is what removes the signal's
evidentiary value for anyone trying to use it, and it does so without the
site ever covertly asserting something false: the page's claim is "this is
what I published, under a policy that says it may be noise", and that claim
is always true.

The corollary is that **nothing anywhere may distinguish an accurate
publication from a deliberate one**. A `noised: true` field, a KV note, a
different TTL, a record comment: any of them would point at exactly the trips
the policy exists to cover. There is therefore no such field in the API
response, in KV, in the records, or in the CLI. Publishing a city he is not
in is just `set <that city>` and leaves no trace. `tests/where.test.ts` keeps
watch on the response shape.

The policy text has to stay on the page unconditionally, including when
nothing is published. A warning that appeared only during private trips would
announce them.

## Setting up

The `WHERE` KV namespace already exists (id
`5b823210670b45859e1295ca5c221faf`) and is wired into `wrangler.jsonc`. The
Worker needs no new secret: it only makes an unauthenticated DNS-over-HTTPS
request.

The **CLI** needs a Cloudflare API token with, on the personal account:

- `Zone > DNS > Edit` on the `agucova.dev` zone (to write the records)
- `Zone > Zone > Read` (to look the zone id up by name)
- `Account > Workers KV Storage > Edit` (to set the flag)

The existing token at `op://Private/zba2amz2hrfsjc3zbfgq7776zq/api_token`
already has all three; verified by creating and deleting a throwaway LOC
record on both zones. The script reads `CLOUDFLARE_API_TOKEN` or
`CLOUDFLARE_PERSONAL_API_TOKEN` from the environment if the secrets loader has
set one, and falls back to `op read`. It never calls `wrangler login`.

## Using it

```fish
bun run scripts/where.ts cities              # the ids `set` accepts
bun run scripts/where.ts set berkeley        # publish, for 14 days
bun run scripts/where.ts set london --days 5 # publish, for 5
bun run scripts/where.ts status              # flag, records, and what the site shows
bun run scripts/where.ts clear               # stop publishing
```

`set` is also how a location is *replaced*: it overwrites both records in
place and restarts the window. Running it again with the same city is how to
extend a stay.

Adding a city is a pull request against
[`src/lib/where/cities.ts`](../src/lib/where/cities.ts), which is the point:
the coordinates the site can ever publish are reviewed rather than typed at a
prompt.

### Flags

- `--days N` (1 to 90, default 14): how long to claim the location for.
- `--name LABEL`: publish at `LABEL.agucova.dev` instead of the apex. For
  testing only. It can only add a label under the same zone.
- `--local`: drive the KV simulation `wrangler dev` uses instead of the
  deployed namespace. **DNS is still the real thing**, since there is no
  local DNS, so combine it with `--name` for an end-to-end test rather than
  running it against the apex.

## Local development

```fish
bun run build
bun run scripts/where.ts set berkeley --name loc-test --days 3 --local
echo 'WHERE_NAME=loc-test.agucova.dev' >> .dev.vars
bunx wrangler dev
curl -s http://localhost:8787/api/where
bun run scripts/where.ts clear --name loc-test --local
```

`WHERE_NAME` is a development-only override of the name the Worker resolves.
It selects a name to look up; there is no way to hand the endpoint an answer,
so it cannot be used to fake a location even by accident.

Unit tests never touch DNS: `resolveWhere` takes the fetch it should use, and
the tests hand it a stub, including RDATA bytes captured verbatim from a real
Cloudflare answer.

## The UI

[`src/components/Where.svelte`](../src/components/Where.svelte) is mounted on
`/where` only, absent from the nav and the home page, on the same footing as
`NowPlaying.svelte`: the copy and styling are placeholders that land properly
with the redesign.

What it does *not* do is render the endpoint's answer. The split is:

- **`/api/where` is asked only whether the site is disclosing a location at
  all.** That question lives in KV, fails closed, and cannot be evaluated in a
  browser. A response that is not `disclosed: true` ends it, whatever DNS says.
- **The location itself is resolved in the visitor's browser.**
  DNS-over-HTTPS is ordinary HTTPS, and both resolvers in `RESOLVERS`
  (`src/lib/where/doh.ts`) send `access-control-allow-origin: *`, so the page
  makes its own DNS query instead of trusting this site's cached copy of one.
  A feature whose premise is "the claim is in DNS, go and check" should not
  require trusting a cache in order to read it.

Two resolvers are asked rather than one, and `resolveAcross` reports whether
they agreed rather than picking a winner. This is not a proof: a resolver is
still a third party that can answer with whatever it likes. What it buys is
that a lie has to be told twice by two unrelated operators to pass unnoticed,
and that propagation appears as a visible disagreement instead of a silent
coin flip. The disagreement path earned its keep immediately: the first live
test reported Cloudflare answering and Google silent, which turned out not to
be propagation at all but the TXT quoting difference noted below. A single
resolver would have shown a confident, unremarkable answer and the bug would
have shipped.

Quad9 is deliberately absent. Its main endpoint speaks RFC 8484 wire format
only, and a wire-format transport is worth building alongside client-side
DNSSEC validation rather than on its own, since a third resolver that is
merely trusted differently buys very little.

Resolvers disagree about spelling in two ways, both of which only show up once
a second resolver is asked, and both of which were live bugs:

- **Generic RDATA.** Cloudflare separates the octets
  (`\# 16 00 26 26 ...`), Google runs them together (`\# 16 002626...`).
  `parseGenericRdata` takes either and checks the octet count against the
  declared length either way.
- **TXT values.** Cloudflare returns the quoted presentation form, Google
  returns the assembled value unquoted. `unquoteTxt` used to require quotes,
  so every Google lookup parsed as "nothing published" and every reading
  looked like a disagreement.

`public/_headers` grants the two resolver origins in the global `default-src`
rather than in a `/where` block, because a per-path CSP is enforced alongside
`/*` rather than instead of it, so a narrower block could only ever subtract.

## Cache behaviour

- The Worker caches the resolved answer in KV for 300 seconds, which is also
  the records' TTL, so the page and a fresh `dig` are never more than about
  five minutes apart.
- A cached disclosure is clipped so it can never outlive the `until` it is
  disclosing.
- `set` and `clear` both drop the cached answer, so a change lands on the next
  request rather than at the end of the window.
- `/api/where` answers `Cache-Control: public, max-age=300`. Everyone gets the
  same JSON, so shared caches are welcome to it.
- None of this caching sits between the `/where` page and the record. The page
  reads DNS itself and uses the endpoint only as the disclosure gate, so the
  KV cache is felt by API consumers rather than by readers.

## DNSSEC: signed, but the chain does not reach the root

Checked 2026-08-23. The state is more annoying than "off":

- The zone **is** signed. Cloudflare reports status `pending`, and
  `dig DNSKEY agucova.dev` returns a live KSK and ZSK on algorithm 13.
- **There is no DS record at the parent.** `dig DS agucova.dev @8.8.8.8`
  returns nothing, so no validating resolver can build a chain of trust down
  to those signatures, and every answer comes back `AD: false`.

The one remaining step is publishing the DS record at the registrar.
Cloudflare records the registrar as `google llc.`, meaning Google Domains,
which was sold to Squarespace in 2023, so confirm where it actually lives now.
The record to publish:

```
agucova.dev. 3600 IN DS 2371 13 2 C83677A0CEF300FE25D2030722E732CE59451F55EA8B9C161912DCE8DE81A994
```

Once that propagates, `AD: true` starts appearing and two things become
available: `src/worker/where.ts` can require it before publishing anything,
and the `/where` component can report a validated chain instead of reporting
the absence of one. The stronger version, validating the chain in the browser
from wire-format answers rather than trusting a resolver's AD bit, additionally
needs the wire-format transport noted above.

`agus.sh` has DNSSEC fully disabled and carries no location records, so none
of this applies to it.
