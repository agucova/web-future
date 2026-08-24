/**
 * Turning a city into the pair of DNS records that publish it, and turning
 * those records back into a city.
 *
 * DNS is the source of truth for this feature: the page does not keep its own
 * copy of where Agus is, it reads the records back and renders whatever they
 * say. That is the whole point. `dig LOC agucova.dev` and the page are not
 * two things kept in agreement, they are one thing rendered twice.
 *
 * Two records carry the claim, both at the same name:
 *
 *   LOC  the place, coarsened to city scale (see ./loc.ts)
 *   TXT  `v=where1; since=YYYY-MM-DD; until=YYYY-MM-DD`, the terms
 *
 * The city *name* is deliberately not published. It is recovered by matching
 * the coordinates against `./cities.ts`, which is in the repository, so the
 * label on the page is a function of the record plus a public table and
 * cannot say "Berkeley" while DNS says something else.
 *
 * `until` is what keeps the claim honest without depending on anyone
 * remembering anything. A location is published with an expiry date on it,
 * that date is as public as the coordinates, and once it passes the site
 * stops saying anything. Nobody has to notice.
 *
 * Imported by the Worker: pure functions and data only.
 */
import { type City, CITIES } from "./cities";
import {
	type LocRecord,
	MAX_PRECISION_METRES,
	toArcminuteThousandths,
} from "./loc";

/** The name both records live at. See docs/where-setup.md for why only one. */
export const WHERE_NAME = "agucova.dev";

/** Prefix that identifies the terms record among the other TXT records. */
export const TERMS_VERSION = "v=where1";

/** How long a publication claims to be good for, unless told otherwise. */
export const DEFAULT_DAYS = 14;

/** Bounds on `--days`, so neither a typo nor a stray zero can widen it. */
export const MIN_DAYS = 1;
export const MAX_DAYS = 90;

/** TTL of both records, in seconds, and the Worker's cache window. */
export const RECORD_TTL_SECONDS = 300;

/**
 * The LOC record for a city.
 *
 * Altitude is published as zero with the vertical precision at its maximum,
 * which is RFC 1876's way of saying the altitude field carries no
 * information. The horizontal precision repeats the city diameter, which says
 * the coordinates are good to city scale and no further.
 */
export function locFor(city: City): LocRecord {
	return {
		latitude: toArcminuteThousandths(city.latitude),
		longitude: toArcminuteThousandths(city.longitude),
		altitudeMetres: 0,
		sizeMetres: city.sizeMetres,
		horizontalPrecisionMetres: city.sizeMetres,
		verticalPrecisionMetres: MAX_PRECISION_METRES,
	};
}

/**
 * The city a resolved LOC record names, or null.
 *
 * Coordinates are compared as integers, so this is exact: a record the CLI
 * wrote matches, and a record anything else wrote does not. A record that
 * matches nothing publishes nothing, which is the only safe reading of "DNS
 * is saying something this site did not put there".
 */
export function cityForLoc(record: LocRecord): City | null {
	for (const city of CITIES) {
		const expected = locFor(city);
		if (expected.latitude === record.latitude && expected.longitude === record.longitude) {
			return city;
		}
	}
	return null;
}

/** The dates in the terms record. */
export interface Terms {
	/** UTC calendar date the location was published, `YYYY-MM-DD`. */
	readonly since: string;
	/** Last UTC calendar date it is claimed for, `YYYY-MM-DD`. */
	readonly until: string;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A calendar date, or null. Rejects the 31st of February and friends. */
function parseDate(value: string): number | null {
	const match = DATE_PATTERN.exec(value);
	if (match === null) return null;
	const timestamp = Date.parse(`${value}T00:00:00Z`);
	if (Number.isNaN(timestamp)) return null;
	// Date.parse accepts overflowing days by rolling them over, so the only
	// way to catch that is to render the result and compare.
	return new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

/** The UTC date `days` after `from`, as `YYYY-MM-DD`. */
export function utcDate(from: Date, days = 0): string {
	return new Date(from.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** The terms record's value, for a publication made now. */
export function formatTerms(terms: Terms): string {
	return `${TERMS_VERSION}; since=${terms.since}; until=${terms.until}`;
}

/**
 * Parses one TXT string. Strict on purpose: an unknown key, a missing date or
 * a `since` after its `until` all mean the record was not written by the CLI
 * that owns this format, and the site says nothing about records it does not
 * fully understand.
 */
export function parseTerms(value: string): Terms | null {
	const parts = value.split(";").map((part) => part.trim());
	if (parts.shift() !== TERMS_VERSION) return null;

	let since: string | null = null;
	let until: string | null = null;

	for (const part of parts) {
		if (part === "") continue;
		const separator = part.indexOf("=");
		if (separator < 0) return null;
		const key = part.slice(0, separator).trim();
		const raw = part.slice(separator + 1).trim();

		if (key === "since") {
			if (since !== null || parseDate(raw) === null) return null;
			since = raw;
		} else if (key === "until") {
			if (until !== null || parseDate(raw) === null) return null;
			until = raw;
		} else {
			// Unknown key: a newer format this code cannot claim to understand.
			return null;
		}
	}

	if (since === null || until === null) return null;
	if ((parseDate(since) as number) > (parseDate(until) as number)) return null;
	return { since, until };
}

/**
 * The instant the claim stops being made: midnight UTC at the end of the
 * `until` day, so a location claimed "until the 6th" covers the whole 6th.
 */
export function expiryOf(terms: Terms): number {
	return (parseDate(terms.until) as number) + 86_400_000;
}

/** Whether the terms still cover `at`. */
export function isCurrent(terms: Terms, at: number): boolean {
	return at < expiryOf(terms);
}
