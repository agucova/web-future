/**
 * Covers the where-am-I feature: the RFC 1876 codec, the city table, the
 * terms record, and the fail-closed contract of GET /api/where.
 *
 * The invariant every one of these tests is really defending is that the page
 * and `dig` cannot say different things. The page has no location of its own;
 * it renders whatever the DNS records say, or nothing. So the tests are
 * mostly about the "or nothing" half: every way a lookup can be incomplete,
 * ambiguous, stale or unrecognised has to end in silence.
 *
 * No DNS is ever queried: `resolveWhere` takes the fetch it should use, and
 * the tests hand it a stub serving recorded-shape answers, including bytes
 * captured from a real Cloudflare answer.
 *
 * Run with: bun test
 */
import { describe, expect, test } from "bun:test";

import { CITIES, cityById } from "../src/lib/where/cities";
import {
	DEFAULT_DAYS,
	MAX_DAYS,
	MIN_DAYS,
	RECORD_TTL_SECONDS,
	TERMS_VERSION,
	WHERE_NAME,
	cityForLoc,
	expiryOf,
	formatTerms,
	isCurrent,
	locFor,
	parseTerms,
	utcDate,
} from "../src/lib/where/index";
import {
	LOC_WIRE_LENGTH,
	MAX_PRECISION_METRES,
	decodeLocWire,
	decodePrecisionByte,
	encodeLocWire,
	encodePrecisionByte,
	formatLoc,
	isRepresentablePrecision,
	parseGenericRdata,
	parseLocAnswer,
	toArcminuteThousandths,
	toCloudflareLocData,
	toDecimalDegrees,
	toSexagesimal,
} from "../src/lib/where/loc";
import { RESOLVERS, resolveAcross } from "../src/lib/where/doh";
import {
	type WhereEnv,
	handleWhereRequest,
	resolveWhere,
	selectLoc,
	selectTerms,
	unquoteTxt,
} from "../src/worker/where";

/**
 * Captured verbatim from `cloudflare-dns.com` answering a LOC record this
 * code wrote, so the decoder is pinned to the real wire format rather than to
 * our own encoder's idea of it. Null Island, 20 km size and horizontal
 * precision, maximum vertical precision.
 */
const REAL_ANSWER = "\\# 16 00 26 26 99 80 00 00 00 80 00 00 00 00 98 96 80";

const LOC_TYPE = 29;
const TXT_TYPE = 16;

function dohUrl(name: string, type: number): string {
	return `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Records every request and answers from a url-keyed route table. */
function stubFetch(routes: Record<string, () => Response>) {
	const calls: string[] = [];
	const fetchLike = async (url: string): Promise<Response> => {
		calls.push(url);
		const route = routes[url];
		if (route === undefined) throw new Error(`Unexpected request: ${url}`);
		return route();
	};
	return { fetchLike, calls };
}

/** Minimal in-memory stand-in for the WHERE KV namespace. */
function stubKv(entries: Record<string, string> = {}) {
	const store = new Map<string, string>(Object.entries(entries));
	return {
		store,
		namespace: {
			async get(key: string, type?: string): Promise<unknown> {
				const raw = store.get(key);
				if (raw === undefined) return null;
				return type === "json" ? JSON.parse(raw) : raw;
			},
			async put(key: string, value: string): Promise<void> {
				store.set(key, value);
			},
			async delete(key: string): Promise<void> {
				store.delete(key);
			},
		},
	};
}

/** A namespace whose every operation fails, for the KV-outage cases. */
const brokenKv = {
	async get(): Promise<never> {
		throw new Error("KV is down");
	},
	async put(): Promise<never> {
		throw new Error("KV is down");
	},
	async delete(): Promise<never> {
		throw new Error("KV is down");
	},
};

function envWith(kv: unknown, name = WHERE_NAME): WhereEnv {
	return { WHERE: kv, WHERE_NAME: name } as unknown as WhereEnv;
}

const BERKELEY = cityById("berkeley");

/** The answers a healthy lookup returns, for a location set today. */
function healthyRoutes(name = WHERE_NAME, days = DEFAULT_DAYS) {
	const now = new Date();
	const terms = { since: utcDate(now), until: utcDate(now, days) };
	const wire = encodeLocWire(locFor(BERKELEY!)) as Uint8Array;
	const hex = [...wire].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
	return {
		terms,
		routes: {
			[dohUrl(name, LOC_TYPE)]: () =>
				json({ Status: 0, Answer: [{ name, type: LOC_TYPE, TTL: 300, data: `\\# ${wire.length} ${hex}` }] }),
			[dohUrl(name, TXT_TYPE)]: () =>
				json({
					Status: 0,
					Answer: [
						// The apex carries unrelated TXT records; they must be
						// stepped over rather than tripped on.
						{ name, type: TXT_TYPE, TTL: 300, data: '"aspe:keyoxide.org:TDJ7KADY5LUZNFIFGWYETVL5TU"' },
						{ name, type: TXT_TYPE, TTL: 300, data: `"${formatTerms(terms)}"` },
					],
				}),
		},
	};
}

describe("the city table", () => {
	test("has unique ids and plausible coordinates", () => {
		expect(new Set(CITIES.map((city) => city.id)).size).toBe(CITIES.length);
		for (const city of CITIES) {
			expect(city.id).toMatch(/^[a-z0-9-]+$/);
			expect(city.name.length).toBeGreaterThan(0);
			expect(city.country.length).toBeGreaterThan(0);
			expect(Math.abs(city.latitude)).toBeLessThanOrEqual(90);
			expect(Math.abs(city.longitude)).toBeLessThanOrEqual(180);
		}
	});

	test("keeps public prose free of em dashes", () => {
		for (const city of CITIES) {
			expect(city.name).not.toContain("—");
			expect(city.country).not.toContain("—");
		}
	});

	/**
	 * RFC 1876 can only hold one significant digit, so a size of 25 km would
	 * be quietly published as something else. Catching that here is what lets
	 * the rest of the system treat the table as authoritative.
	 */
	test("uses sizes the LOC record can express exactly", () => {
		for (const city of CITIES) {
			expect(isRepresentablePrecision(city.sizeMetres)).toBe(true);
			expect(city.sizeMetres).toBeGreaterThan(0);
		}
	});

	test("publishes every city at city scale and no finer", () => {
		for (const city of CITIES) {
			const record = locFor(city);
			// Whole arcminutes: the seconds field is always zero.
			expect(toSexagesimal(record.latitude, "latitude").seconds).toBe(0);
			expect(toSexagesimal(record.longitude, "longitude").seconds).toBe(0);
			// The record states its own coarseness.
			expect(record.horizontalPrecisionMetres).toBe(city.sizeMetres);
			expect(record.horizontalPrecisionMetres).toBeGreaterThanOrEqual(10_000);
			// And says the altitude means nothing.
			expect(record.altitudeMetres).toBe(0);
			expect(record.verticalPrecisionMetres).toBe(MAX_PRECISION_METRES);
		}
	});

	test("gives every city coordinates no other city shares", () => {
		const seen = new Set<string>();
		for (const city of CITIES) {
			const record = locFor(city);
			const key = `${record.latitude}/${record.longitude}`;
			expect(seen.has(key)).toBe(false);
			seen.add(key);
		}
	});

	test("round-trips every city through the published record", () => {
		for (const city of CITIES) {
			const wire = encodeLocWire(locFor(city)) as Uint8Array;
			const decoded = decodeLocWire(wire);
			expect(decoded).not.toBeNull();
			expect(cityForLoc(decoded!)?.id).toBe(city.id);
		}
	});
});

describe("the RFC 1876 codec", () => {
	test("packs size and precision into one byte", () => {
		expect(encodePrecisionByte(1)).toBe(0x12);
		expect(encodePrecisionByte(20_000)).toBe(0x26);
		expect(encodePrecisionByte(MAX_PRECISION_METRES)).toBe(0x99);
		expect(encodePrecisionByte(0)).toBe(0);
		expect(decodePrecisionByte(0x12)).toBe(1);
		expect(decodePrecisionByte(0x26)).toBe(20_000);
		expect(decodePrecisionByte(0x99)).toBe(MAX_PRECISION_METRES);
	});

	test("refuses figures it cannot express, rather than rounding them", () => {
		// 25 km needs two significant digits.
		expect(encodePrecisionByte(25_000)).toBeNull();
		expect(isRepresentablePrecision(25_000)).toBe(false);
		expect(encodePrecisionByte(-1)).toBeNull();
		expect(encodePrecisionByte(Number.NaN)).toBeNull();
		// Beyond 9 x 10^9 cm there is nowhere to put the mantissa.
		expect(encodePrecisionByte(MAX_PRECISION_METRES * 10)).toBeNull();
	});

	test("rounds coordinates to whole arcminutes", () => {
		// 37.87 N is 2272.2 arcminutes, which rounds to 2272.
		expect(toArcminuteThousandths(37.87)).toBe(2272 * 60_000);
		expect(toArcminuteThousandths(-122.27)).toBe(-7336 * 60_000);
		expect(toArcminuteThousandths(0)).toBe(0);
		// 51.51 N is 3090.6 arcminutes, which rounds up to 3091.
		expect(toDecimalDegrees(toArcminuteThousandths(51.51))).toBeCloseTo(3091 / 60, 9);
	});

	test("splits an axis into degrees, minutes and a direction", () => {
		expect(toSexagesimal(toArcminuteThousandths(37.87), "latitude")).toEqual({
			degrees: 37,
			minutes: 52,
			seconds: 0,
			direction: "N",
		});
		expect(toSexagesimal(toArcminuteThousandths(-33.45), "latitude").direction).toBe("S");
		expect(toSexagesimal(toArcminuteThousandths(-122.27), "longitude")).toEqual({
			degrees: 122,
			minutes: 16,
			seconds: 0,
			direction: "W",
		});
		expect(toSexagesimal(toArcminuteThousandths(0.13), "longitude").direction).toBe("E");
	});

	test("decodes bytes captured from a real Cloudflare answer", () => {
		const record = parseLocAnswer(REAL_ANSWER);
		expect(record).toEqual({
			latitude: 0,
			longitude: 0,
			altitudeMetres: 0,
			sizeMetres: 20_000,
			horizontalPrecisionMetres: 20_000,
			verticalPrecisionMetres: MAX_PRECISION_METRES,
		});
	});

	test("round-trips a record through the wire format", () => {
		const record = locFor(BERKELEY!);
		const wire = encodeLocWire(record) as Uint8Array;
		expect(wire.length).toBe(LOC_WIRE_LENGTH);
		expect(decodeLocWire(wire)).toEqual(record);
	});

	test("rejects generic RDATA that is not a version 0 LOC", () => {
		expect(parseGenericRdata("nonsense")).toBeNull();
		// Declared length disagreeing with the byte count.
		expect(parseGenericRdata("\\# 16 00 26")).toBeNull();
		// Right length, wrong version byte.
		expect(parseLocAnswer("\\# 16 01 26 26 99 80 00 00 00 80 00 00 00 00 98 96 80")).toBeNull();
		// A LOC record of the wrong size.
		expect(parseLocAnswer("\\# 4 00 26 26 99")).toBeNull();
		expect(decodeLocWire(new Uint8Array(15))).toBeNull();
	});

	test("prints the record the way dig does", () => {
		expect(formatLoc(locFor(BERKELEY!))).toBe("37 52 0.000 N 122 16 0.000 W 0.00m 20000m 20000m 90000000m");
		expect(formatLoc(parseLocAnswer(REAL_ANSWER)!)).toBe("0 0 0.000 N 0 0 0.000 E 0.00m 20000m 20000m 90000000m");
	});

	test("hands the Cloudflare API the same figures it prints", () => {
		expect(toCloudflareLocData(locFor(BERKELEY!))).toEqual({
			lat_degrees: 37,
			lat_minutes: 52,
			lat_seconds: 0,
			lat_direction: "N",
			long_degrees: 122,
			long_minutes: 16,
			long_seconds: 0,
			long_direction: "W",
			altitude: 0,
			size: 20_000,
			precision_horz: 20_000,
			precision_vert: MAX_PRECISION_METRES,
		});
	});
});

describe("the terms record", () => {
	test("round-trips", () => {
		const terms = { since: "2026-08-23", until: "2026-09-06" };
		expect(formatTerms(terms)).toBe(`${TERMS_VERSION}; since=2026-08-23; until=2026-09-06`);
		expect(parseTerms(formatTerms(terms))).toEqual(terms);
	});

	test("refuses anything it does not fully understand", () => {
		expect(parseTerms("")).toBeNull();
		expect(parseTerms("v=where2; since=2026-08-23; until=2026-09-06")).toBeNull();
		// Missing halves.
		expect(parseTerms(`${TERMS_VERSION}; since=2026-08-23`)).toBeNull();
		expect(parseTerms(`${TERMS_VERSION}; until=2026-09-06`)).toBeNull();
		// A key this version does not know is a newer format, not a hint.
		expect(parseTerms(`${TERMS_VERSION}; since=2026-08-23; until=2026-09-06; noise=yes`)).toBeNull();
		// Dates that are not dates.
		expect(parseTerms(`${TERMS_VERSION}; since=2026-02-31; until=2026-09-06`)).toBeNull();
		expect(parseTerms(`${TERMS_VERSION}; since=yesterday; until=2026-09-06`)).toBeNull();
		expect(parseTerms(`${TERMS_VERSION}; since=2026-8-3; until=2026-09-06`)).toBeNull();
		// Backwards.
		expect(parseTerms(`${TERMS_VERSION}; since=2026-09-06; until=2026-08-23`)).toBeNull();
		// Repeated.
		expect(parseTerms(`${TERMS_VERSION}; since=2026-08-23; since=2026-08-24; until=2026-09-06`)).toBeNull();
	});

	test("expires at the end of the until day", () => {
		const terms = { since: "2026-08-23", until: "2026-09-06" };
		expect(expiryOf(terms)).toBe(Date.parse("2026-09-07T00:00:00Z"));
		expect(isCurrent(terms, Date.parse("2026-09-06T23:59:59Z"))).toBe(true);
		expect(isCurrent(terms, Date.parse("2026-09-07T00:00:00Z"))).toBe(false);
	});

	test("keeps the default window inside its own bounds", () => {
		expect(DEFAULT_DAYS).toBeGreaterThanOrEqual(MIN_DAYS);
		expect(DEFAULT_DAYS).toBeLessThanOrEqual(MAX_DAYS);
	});

	test("unwraps the quoting DNS-over-HTTPS adds", () => {
		expect(unquoteTxt('"v=where1; since=2026-08-23; until=2026-09-06"')).toBe(
			"v=where1; since=2026-08-23; until=2026-09-06",
		);
		// A long value arrives as several strings that concatenate.
		expect(unquoteTxt('"one" "two"')).toBe("onetwo");
		// An unquoted value is not malformed, it is how Google returns TXT.
		// Rejecting it made every lookup through a second resolver read as
		// "nothing published", which is why this is accepted now.
		expect(unquoteTxt("unquoted")).toBe("unquoted");
	});
});

describe("selecting records", () => {
	test("takes the single LOC record and refuses a crowd", () => {
		expect(selectLoc([REAL_ANSWER])).not.toBeNull();
		expect(selectLoc([])).toBeNull();
		expect(selectLoc([REAL_ANSWER, REAL_ANSWER])).toBeNull();
	});

	test("finds the terms among the apex's other TXT records", () => {
		const terms = `"${TERMS_VERSION}; since=2026-08-23; until=2026-09-06"`;
		expect(selectTerms(['"aspe:keyoxide.org:X"', terms, '"v=spf1 -all"'])).toEqual({
			since: "2026-08-23",
			until: "2026-09-06",
		});
		expect(selectTerms(['"aspe:keyoxide.org:X"'])).toBeNull();
		// Two of them is an ambiguity, and guessing is not an option.
		expect(selectTerms([terms, terms])).toBeNull();
		// One of them, malformed, is not an invitation to look for another.
		expect(selectTerms([`"${TERMS_VERSION}; since=nope; until=2026-09-06"`])).toBeNull();
	});
});

describe("GET /api/where", () => {
	test("publishes the city DNS names, and nothing the records did not say", async () => {
		const { terms, routes } = healthyRoutes();
		const kv = stubKv({ "disclose:v1": "on" });
		const { fetchLike } = stubFetch(routes);

		expect(await resolveWhere(envWith(kv.namespace), fetchLike)).toEqual({
			disclosed: true,
			cityId: "berkeley",
			city: "Berkeley",
			country: "United States",
			latitude: toDecimalDegrees(toArcminuteThousandths(37.87)),
			longitude: toDecimalDegrees(toArcminuteThousandths(-122.27)),
			precisionMetres: 20_000,
			since: terms.since,
			until: terms.until,
			name: WHERE_NAME,
			loc: "37 52 0.000 N 122 16 0.000 W 0.00m 20000m 20000m 90000000m",
		});
	});

	test("says nothing unless the flag says exactly on", async () => {
		const { routes } = healthyRoutes();
		const { fetchLike } = stubFetch(routes);

		// Missing flag: the default is silence, unlike Spotify's ghost mode.
		expect(await resolveWhere(envWith(stubKv().namespace), fetchLike)).toEqual({ disclosed: false });
		// A value that is not the flag.
		expect(await resolveWhere(envWith(stubKv({ "disclose:v1": "yes" }).namespace), fetchLike)).toEqual({
			disclosed: false,
		});
		expect(await resolveWhere(envWith(stubKv({ "disclose:v1": "ON" }).namespace), fetchLike)).toEqual({
			disclosed: false,
		});
		// The other feature's flag has no effect here, and vice versa.
		expect(await resolveWhere(envWith(stubKv({ "ghost:v1": "on" }).namespace), fetchLike)).toEqual({
			disclosed: false,
		});
	});

	test("says nothing when it cannot tell whether disclosure is allowed", async () => {
		const { routes } = healthyRoutes();
		const { fetchLike, calls } = stubFetch(routes);

		// KV outage.
		expect(await resolveWhere(envWith(brokenKv), fetchLike)).toEqual({ disclosed: false });
		// No binding at all.
		expect(await resolveWhere({} as WhereEnv, fetchLike)).toEqual({ disclosed: false });
		// And in neither case was DNS asked, so nothing was even looked up.
		expect(calls).toEqual([]);
	});

	test("checks the flag before the cache, so switching off is immediate", async () => {
		const { terms } = healthyRoutes();
		const cached = JSON.stringify({
			expiresAt: Date.now() + 60_000,
			value: { disclosed: true, city: "Berkeley", since: terms.since, until: terms.until },
		});
		const kv = stubKv({ "answer:v1": cached });
		const { fetchLike, calls } = stubFetch({});

		expect(await resolveWhere(envWith(kv.namespace), fetchLike)).toEqual({ disclosed: false });
		expect(calls).toEqual([]);
	});

	test("serves the cache while it is fresh, then looks again", async () => {
		const { routes } = healthyRoutes();
		const kv = stubKv({ "disclose:v1": "on" });
		const { fetchLike, calls } = stubFetch(routes);

		await resolveWhere(envWith(kv.namespace), fetchLike);
		expect(calls.length).toBe(2);
		await resolveWhere(envWith(kv.namespace), fetchLike);
		expect(calls.length).toBe(2);

		kv.store.delete("answer:v1");
		await resolveWhere(envWith(kv.namespace), fetchLike);
		expect(calls.length).toBe(4);
	});

	test("never caches a disclosure past its own expiry", async () => {
		const { routes } = healthyRoutes(WHERE_NAME, 0);
		const kv = stubKv({ "disclose:v1": "on" });
		const { fetchLike } = stubFetch(routes);

		await resolveWhere(envWith(kv.namespace), fetchLike);
		const cached = JSON.parse(kv.store.get("answer:v1") as string) as { expiresAt: number };
		// Today's date as the until day: the entry may not outlive today.
		expect(cached.expiresAt).toBeLessThanOrEqual(Date.parse(`${utcDate(new Date(), 1)}T00:00:00Z`));
	});

	test("says nothing when either record is missing", async () => {
		const { routes } = healthyRoutes();
		const kv = () => stubKv({ "disclose:v1": "on" }).namespace;
		const empty = () => json({ Status: 0 });

		const noLoc = stubFetch({ ...routes, [dohUrl(WHERE_NAME, LOC_TYPE)]: empty });
		expect(await resolveWhere(envWith(kv()), noLoc.fetchLike)).toEqual({ disclosed: false });

		const noTxt = stubFetch({ ...routes, [dohUrl(WHERE_NAME, TXT_TYPE)]: empty });
		expect(await resolveWhere(envWith(kv()), noTxt.fetchLike)).toEqual({ disclosed: false });
	});

	test("says nothing when the resolver is unhappy", async () => {
		const { routes } = healthyRoutes();
		const kv = () => stubKv({ "disclose:v1": "on" }).namespace;

		const servfail = stubFetch({ ...routes, [dohUrl(WHERE_NAME, LOC_TYPE)]: () => json({ Status: 2 }) });
		expect(await resolveWhere(envWith(kv()), servfail.fetchLike)).toEqual({ disclosed: false });

		const http500 = stubFetch({ ...routes, [dohUrl(WHERE_NAME, LOC_TYPE)]: () => json({}, 500) });
		expect(await resolveWhere(envWith(kv()), http500.fetchLike)).toEqual({ disclosed: false });

		const garbage = stubFetch({
			...routes,
			[dohUrl(WHERE_NAME, TXT_TYPE)]: () => new Response("not json", { status: 200 }),
		});
		expect(await resolveWhere(envWith(kv()), garbage.fetchLike)).toEqual({ disclosed: false });

		const unreachable = stubFetch({ [dohUrl(WHERE_NAME, TXT_TYPE)]: routes[dohUrl(WHERE_NAME, TXT_TYPE)]! });
		expect(await resolveWhere(envWith(kv()), unreachable.fetchLike)).toEqual({ disclosed: false });
	});

	test("says nothing once the terms have expired", async () => {
		const name = WHERE_NAME;
		const wire = encodeLocWire(locFor(BERKELEY!)) as Uint8Array;
		const hex = [...wire].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
		const stale = { since: utcDate(new Date(), -90), until: utcDate(new Date(), -1) };
		const { fetchLike } = stubFetch({
			[dohUrl(name, LOC_TYPE)]: () =>
				json({ Status: 0, Answer: [{ name, type: LOC_TYPE, data: `\\# ${wire.length} ${hex}` }] }),
			[dohUrl(name, TXT_TYPE)]: () =>
				json({ Status: 0, Answer: [{ name, type: TXT_TYPE, data: `"${formatTerms(stale)}"` }] }),
		});

		expect(await resolveWhere(envWith(stubKv({ "disclose:v1": "on" }).namespace), fetchLike)).toEqual({
			disclosed: false,
		});
	});

	test("says nothing for coordinates no city in the table claims", async () => {
		const name = WHERE_NAME;
		const terms = { since: utcDate(new Date()), until: utcDate(new Date(), 7) };
		const { fetchLike } = stubFetch({
			// Null Island is a real, well-formed LOC record and not a city.
			[dohUrl(name, LOC_TYPE)]: () => json({ Status: 0, Answer: [{ name, type: LOC_TYPE, data: REAL_ANSWER }] }),
			[dohUrl(name, TXT_TYPE)]: () =>
				json({ Status: 0, Answer: [{ name, type: TXT_TYPE, data: `"${formatTerms(terms)}"` }] }),
		});

		expect(await resolveWhere(envWith(stubKv({ "disclose:v1": "on" }).namespace), fetchLike)).toEqual({
			disclosed: false,
		});
	});

	test("answers 200 with the same shape whatever happens", async () => {
		const request = new Request("https://agucova.dev/api/where");
		const response = await handleWhereRequest(request, envWith(brokenKv));
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("application/json");
		expect(response.headers.get("cache-control")).toBe(`public, max-age=${RECORD_TTL_SECONDS}`);
		expect(await response.json()).toEqual({ disclosed: false });
	});

	test("refuses writes", async () => {
		const post = new Request("https://agucova.dev/api/where", { method: "POST" });
		const response = await handleWhereRequest(post, envWith(stubKv().namespace));
		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");

		const options = new Request("https://agucova.dev/api/where", { method: "OPTIONS" });
		expect((await handleWhereRequest(options, envWith(stubKv().namespace))).status).toBe(204);
	});

	/**
	 * The noise policy works by being permanent and unconditional. Anything
	 * that marked an individual publication as deliberate noise would point at
	 * exactly the trips the policy exists to cover, so no such field may exist
	 * in the response, in the records, or in KV.
	 */
	test("exposes nothing that would distinguish a true location from a noised one", async () => {
		const { routes } = healthyRoutes();
		const kv = stubKv({ "disclose:v1": "on" });
		const { fetchLike } = stubFetch(routes);

		const answer = (await resolveWhere(envWith(kv.namespace), fetchLike)) as Record<string, unknown>;
		for (const key of Object.keys(answer)) {
			expect(key).not.toMatch(/noise|fake|decoy|accurate|real|true[A-Z]/i);
		}
		// And KV holds only the flag and the cached copy of the answer.
		expect([...kv.store.keys()].sort()).toEqual(["answer:v1", "disclose:v1"]);
	});
});

/**
 * Reading the record in the visitor's browser.
 *
 * The page does not take /api/where's word for where Agus is; it asks public
 * DNS-over-HTTPS resolvers itself. That means two things have to hold that
 * did not have to before: the parser must cope with more than one resolver's
 * spelling of the same bytes, and disagreement between resolvers has to be
 * reported rather than silently resolved in someone's favour.
 */
describe("resolving in the browser", () => {
	/** Google returns generic RDATA as one unbroken hex run; Cloudflare spaces it. */
	const REAL_ANSWER_CONTIGUOUS = "\\# 16 00262699800000008000000000989680";

	test("both resolvers' spellings of one record decode identically", () => {
		const spaced = parseGenericRdata(REAL_ANSWER);
		const contiguous = parseGenericRdata(REAL_ANSWER_CONTIGUOUS);
		expect(spaced).not.toBeNull();
		expect(contiguous).toEqual(spaced as Uint8Array);
		expect(parseLocAnswer(REAL_ANSWER_CONTIGUOUS)).toEqual(parseLocAnswer(REAL_ANSWER));
	});

	test("both resolvers' spellings of a TXT value survive", () => {
		// Cloudflare quotes the presentation form; Google hands back the value.
		expect(unquoteTxt('"v=where1; since=2026-08-01; until=2026-08-15"')).toBe(
			"v=where1; since=2026-08-01; until=2026-08-15",
		);
		expect(unquoteTxt("v=where1; since=2026-08-01; until=2026-08-15")).toBe(
			"v=where1; since=2026-08-01; until=2026-08-15",
		);
		// A long value still arrives as segments that concatenate.
		expect(unquoteTxt('"one" "two"')).toBe("onetwo");
		// A stray quote forms no complete segment, so the shape is not understood.
		expect(unquoteTxt('v=where1; "')).toBeNull();
		expect(unquoteTxt("   ")).toBeNull();
	});

	test("the declared length still has to match what was supplied", () => {
		// One octet short of the 16 it claims, in both spellings.
		expect(parseGenericRdata("\\# 16 002626998000000080000000009896")).toBeNull();
		expect(parseGenericRdata("\\# 16 00 26 26 99 80 00 00 00 80 00 00 00 00 98 96")).toBeNull();
		// One octet too many.
		expect(parseGenericRdata("\\# 16 0026269980000000800000000098968000")).toBeNull();
		// Odd number of hex digits is not a whole number of octets.
		expect(parseGenericRdata("\\# 16 0026269980000000800000000098968")).toBeNull();
	});

	const BERKELEY_WIRE = encodeLocWire(locFor(BERKELEY!)) as Uint8Array;
	const BERKELEY_OCTETS = [...BERKELEY_WIRE].map((byte) => byte.toString(16).padStart(2, "0"));
	/** The same record as each resolver actually spells it on the wire. */
	const BERKELEY_SPACED = `\\# ${BERKELEY_WIRE.length} ${BERKELEY_OCTETS.join(" ")}`;
	const BERKELEY_CONTIGUOUS = `\\# ${BERKELEY_WIRE.length} ${BERKELEY_OCTETS.join("")}`;

	function resolverUrl(endpoint: string, name: string, type: number): string {
		return `${endpoint}?name=${encodeURIComponent(name)}&type=${type}`;
	}

	/** Answers every resolver in RESOLVERS from one per-resolver body factory. */
	function stubAllResolvers(
		name: string,
		body: (resolverId: string, type: number) => Response,
	) {
		const routes: Record<string, () => Response> = {};
		for (const resolver of RESOLVERS) {
			for (const type of [LOC_TYPE, TXT_TYPE]) {
				routes[resolverUrl(resolver.endpoint, name, type)] = () => body(resolver.id, type);
			}
		}
		return stubFetch(routes);
	}

	const TERMS_ANSWER = { name: WHERE_NAME, type: TXT_TYPE, data: `"v=where1; since=2026-08-01; until=2099-01-01"` };
	const NOW = Date.parse("2026-08-23T00:00:00Z");

	test("agreeing resolvers produce one answer", async () => {
		const { fetchLike, calls } = stubAllResolvers(WHERE_NAME, (resolverId, type) =>
			json({
				Status: 0,
				AD: false,
				Answer:
					type === LOC_TYPE
						? [
								{
									name: WHERE_NAME,
									type: LOC_TYPE,
									// Each resolver spells the same bytes its own way.
									data: resolverId === "google" ? BERKELEY_CONTIGUOUS : BERKELEY_SPACED,
								},
							]
						: [TERMS_ANSWER],
			}),
		);

		const consensus = await resolveAcross(WHERE_NAME, fetchLike, NOW);
		expect(consensus.usable).toBe(RESOLVERS.length);
		expect(consensus.agreed).toBe(true);
		expect(consensus.answer?.disclosed).toBe(true);
		expect(consensus.authenticated).toBe(false);
		// Every resolver was actually asked, rather than one being reused.
		expect(calls.length).toBe(RESOLVERS.length * 2);
	});

	test("the AD bit is only reported when every resolver sets it", async () => {
		const { fetchLike } = stubAllResolvers(WHERE_NAME, (resolverId, type) =>
			json({
				Status: 0,
				AD: resolverId === "cloudflare",
				Answer: type === LOC_TYPE ? [{ name: WHERE_NAME, type: LOC_TYPE, data: BERKELEY_SPACED }] : [TERMS_ANSWER],
			}),
		);

		const consensus = await resolveAcross(WHERE_NAME, fetchLike, NOW);
		expect(consensus.agreed).toBe(true);
		expect(consensus.authenticated).toBe(false);
	});

	test("disagreement is reported, not resolved", async () => {
		const { fetchLike } = stubAllResolvers(WHERE_NAME, (resolverId, type) => {
			if (type === TXT_TYPE) return json({ Status: 0, Answer: [TERMS_ANSWER] });
			// One resolver still has the record, the other has already dropped it.
			return resolverId === "cloudflare"
				? json({ Status: 0, Answer: [{ name: WHERE_NAME, type: LOC_TYPE, data: BERKELEY_SPACED }] })
				: json({ Status: 0 });
		});

		const consensus = await resolveAcross(WHERE_NAME, fetchLike, NOW);
		expect(consensus.usable).toBe(RESOLVERS.length);
		expect(consensus.agreed).toBe(false);
		// No winner is picked when the resolvers do not match.
		expect(consensus.answer).toBeNull();
	});

	test("one unreachable resolver does not stop the other", async () => {
		const routes: Record<string, () => Response> = {};
		for (const resolver of RESOLVERS) {
			for (const type of [LOC_TYPE, TXT_TYPE]) {
				routes[resolverUrl(resolver.endpoint, WHERE_NAME, type)] = () =>
					resolver.id === "google"
						? new Response("upstream is unwell", { status: 502 })
						: json({
								Status: 0,
								Answer:
									type === LOC_TYPE
										? [{ name: WHERE_NAME, type: LOC_TYPE, data: BERKELEY_SPACED }]
										: [TERMS_ANSWER],
							});
			}
		}
		const { fetchLike } = stubFetch(routes);

		const consensus = await resolveAcross(WHERE_NAME, fetchLike, NOW);
		expect(consensus.usable).toBe(1);
		expect(consensus.agreed).toBe(true);
		expect(consensus.answer?.disclosed).toBe(true);
	});

	test("no reachable resolver means no answer and no agreement", async () => {
		const { fetchLike } = stubAllResolvers(WHERE_NAME, () => new Response("", { status: 500 }));

		const consensus = await resolveAcross(WHERE_NAME, fetchLike, NOW);
		expect(consensus.usable).toBe(0);
		expect(consensus.agreed).toBe(false);
		expect(consensus.answer).toBeNull();
		expect(consensus.authenticated).toBe(false);
	});

	test("expired terms are silence, and silence still counts as agreement", async () => {
		const expired = { name: WHERE_NAME, type: TXT_TYPE, data: `"v=where1; since=2026-01-01; until=2026-01-05"` };
		const { fetchLike } = stubAllResolvers(WHERE_NAME, (_resolverId, type) =>
			json({
				Status: 0,
				Answer: type === LOC_TYPE ? [{ name: WHERE_NAME, type: LOC_TYPE, data: BERKELEY_SPACED }] : [expired],
			}),
		);

		const consensus = await resolveAcross(WHERE_NAME, fetchLike, NOW);
		expect(consensus.agreed).toBe(true);
		expect(consensus.answer?.disclosed).toBe(false);
	});
});
