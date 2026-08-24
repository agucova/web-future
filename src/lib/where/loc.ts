/**
 * RFC 1876 LOC records: the wire format, the presentation format, and the
 * coarsening rules the site applies before anything is published.
 *
 * This module is the one place that knows how a city becomes a LOC record and
 * how a LOC record becomes a city again. Both halves of the feature import it:
 * `scripts/where.ts` writes the record through the Cloudflare DNS API, and
 * `src/worker/where.ts` reads it back over DNS-over-HTTPS. Because the same
 * code encodes and decodes, `dig LOC agucova.dev` and the page cannot mean
 * different things.
 *
 * Three deliberate coarsenings, all of them visible in the record itself
 * rather than only in prose:
 *
 *   - Coordinates are rounded to whole arcminutes, so the seconds field is
 *     always `0.000`. That is a grid of roughly 1.8 km.
 *   - `size` carries the diameter of the city, not of a person.
 *   - `horizontal precision` carries the same figure, which is RFC 1876's own
 *     way of saying "these coordinates are only good to city scale".
 *   - `vertical precision` is set to the largest representable value, which
 *     says the altitude field carries no information at all.
 *
 * Like `src/lib/agents/pages.ts`, this is imported by the Worker, so it must
 * stay pure: no DOM, no Node, no Astro.
 */

/** RDATA length of a LOC record, in bytes. */
export const LOC_WIRE_LENGTH = 16;

/** Thousandths of an arcsecond in one degree. */
const THOUSANDTHS_PER_DEGREE = 3_600_000;
const THOUSANDTHS_PER_MINUTE = 60_000;
const THOUSANDTHS_PER_SECOND = 1_000;

/** The wire encoding puts the equator and the prime meridian at 2^31. */
const WIRE_ORIGIN = 2 ** 31;

/**
 * The wire encoding measures altitude in centimetres from a datum 100 000 m
 * below the WGS 84 spheroid, so sea level is this value.
 */
const ALTITUDE_BASE_CM = 10_000_000;

/**
 * Largest value the size and precision fields can express: 9 x 10^9 cm.
 * Used as the vertical precision, where it reads as "no altitude data".
 */
export const MAX_PRECISION_METRES = 90_000_000;

/**
 * One LOC record, in the units it is most useful in.
 *
 * Latitude and longitude are signed integers in thousandths of an arcsecond
 * (positive north and east), which is exactly the resolution the wire format
 * has. Keeping them as integers means two records can be compared for
 * equality without any floating point tolerance, which is what lets the
 * Worker match a resolved record back to a city with certainty.
 */
export interface LocRecord {
	readonly latitude: number;
	readonly longitude: number;
	readonly altitudeMetres: number;
	readonly sizeMetres: number;
	readonly horizontalPrecisionMetres: number;
	readonly verticalPrecisionMetres: number;
}

/** Degrees, minutes and seconds of one axis, for display and for the API. */
export interface Sexagesimal {
	readonly degrees: number;
	readonly minutes: number;
	readonly seconds: number;
	readonly direction: "N" | "S" | "E" | "W";
}

// --- coarsening -------------------------------------------------------------

/**
 * Rounds decimal degrees to the nearest whole arcminute and returns the
 * result in thousandths of an arcsecond. Every coordinate the site publishes
 * goes through here, so no finer figure can reach DNS even by accident.
 */
export function toArcminuteThousandths(decimalDegrees: number): number {
	if (!Number.isFinite(decimalDegrees)) {
		throw new RangeError(`Not a coordinate: ${decimalDegrees}`);
	}
	return Math.round(decimalDegrees * 60) * THOUSANDTHS_PER_MINUTE;
}

/** Thousandths of an arcsecond back to decimal degrees. */
export function toDecimalDegrees(thousandths: number): number {
	return thousandths / THOUSANDTHS_PER_DEGREE;
}

/** Splits a signed axis into degrees, minutes, seconds and a direction. */
export function toSexagesimal(thousandths: number, axis: "latitude" | "longitude"): Sexagesimal {
	const negative = thousandths < 0;
	const direction = axis === "latitude" ? (negative ? "S" : "N") : negative ? "W" : "E";
	const magnitude = Math.abs(thousandths);

	const degrees = Math.floor(magnitude / THOUSANDTHS_PER_DEGREE);
	const afterDegrees = magnitude - degrees * THOUSANDTHS_PER_DEGREE;
	const minutes = Math.floor(afterDegrees / THOUSANDTHS_PER_MINUTE);
	const afterMinutes = afterDegrees - minutes * THOUSANDTHS_PER_MINUTE;

	return { degrees, minutes, seconds: afterMinutes / THOUSANDTHS_PER_SECOND, direction };
}

// --- the size and precision byte --------------------------------------------

/**
 * RFC 1876 stores size and precision as one byte: a single digit of mantissa
 * in the high nibble and a power of ten in the low nibble, in centimetres. So
 * 20 km is representable exactly (2 x 10^6 cm) and 25 km is not.
 *
 * Returns null rather than rounding. Silently publishing a different figure
 * from the one in the city table is precisely the drift this feature is
 * supposed to be incapable of, so the caller is made to deal with it.
 */
export function encodePrecisionByte(metres: number): number | null {
	if (!Number.isFinite(metres) || metres < 0) return null;

	const centimetres = Math.round(metres * 100);
	if (Math.abs(centimetres - metres * 100) > 1e-6) return null;
	if (centimetres === 0) return 0;

	let mantissa = centimetres;
	let exponent = 0;
	while (mantissa % 10 === 0 && exponent < 9) {
		mantissa /= 10;
		exponent += 1;
	}
	if (mantissa > 9) return null;

	return (mantissa << 4) | exponent;
}

/** The inverse: one byte back to metres. */
export function decodePrecisionByte(byte: number): number {
	const mantissa = (byte >> 4) & 0x0f;
	const exponent = byte & 0x0f;
	return (mantissa * 10 ** exponent) / 100;
}

/** Whether a figure survives the round trip through the one-byte encoding. */
export function isRepresentablePrecision(metres: number): boolean {
	const byte = encodePrecisionByte(metres);
	return byte !== null && decodePrecisionByte(byte) === metres;
}

// --- wire format ------------------------------------------------------------

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
	bytes[offset] = (value >>> 24) & 0xff;
	bytes[offset + 1] = (value >>> 16) & 0xff;
	bytes[offset + 2] = (value >>> 8) & 0xff;
	bytes[offset + 3] = value & 0xff;
}

function readUint32(bytes: Uint8Array, offset: number): number {
	return (
		(bytes[offset] as number) * 0x1000000 +
		((bytes[offset + 1] as number) << 16) +
		((bytes[offset + 2] as number) << 8) +
		(bytes[offset + 3] as number)
	);
}

/**
 * Encodes a record to its 16 wire bytes. Only used by the tests, which check
 * the decoder against records this produces as well as against bytes captured
 * from a real Cloudflare answer.
 */
export function encodeLocWire(record: LocRecord): Uint8Array | null {
	const size = encodePrecisionByte(record.sizeMetres);
	const horizontal = encodePrecisionByte(record.horizontalPrecisionMetres);
	const vertical = encodePrecisionByte(record.verticalPrecisionMetres);
	if (size === null || horizontal === null || vertical === null) return null;

	const bytes = new Uint8Array(LOC_WIRE_LENGTH);
	bytes[0] = 0;
	bytes[1] = size;
	bytes[2] = horizontal;
	bytes[3] = vertical;
	writeUint32(bytes, 4, WIRE_ORIGIN + record.latitude);
	writeUint32(bytes, 8, WIRE_ORIGIN + record.longitude);
	writeUint32(bytes, 12, ALTITUDE_BASE_CM + Math.round(record.altitudeMetres * 100));
	return bytes;
}

/** Decodes 16 wire bytes. Returns null for anything that is not a LOC v0. */
export function decodeLocWire(bytes: Uint8Array): LocRecord | null {
	if (bytes.length !== LOC_WIRE_LENGTH) return null;
	// Version 0 is the only version RFC 1876 defines. A future version would
	// have a different layout, so refusing it is the only safe reading.
	if (bytes[0] !== 0) return null;

	return {
		latitude: readUint32(bytes, 4) - WIRE_ORIGIN,
		longitude: readUint32(bytes, 8) - WIRE_ORIGIN,
		altitudeMetres: (readUint32(bytes, 12) - ALTITUDE_BASE_CM) / 100,
		sizeMetres: decodePrecisionByte(bytes[1] as number),
		horizontalPrecisionMetres: decodePrecisionByte(bytes[2] as number),
		verticalPrecisionMetres: decodePrecisionByte(bytes[3] as number),
	};
}

/**
 * Parses the RFC 3597 generic form that DNS-over-HTTPS JSON APIs return for
 * record types they have no pretty printer for. Resolvers disagree on
 * whether to separate the octets, so both spellings of the same bytes occur:
 *
 *   \# 16 00 26 26 99 80 00 00 00 80 00 00 00 00 98 96 80   (Cloudflare)
 *   \# 16 002626998000000080000000009896 80                 (Google)
 *
 * The declared length is checked against the octets actually supplied, so a
 * truncated or padded payload is rejected rather than silently decoded.
 * Nothing outside this shape is accepted: a different form means something
 * changed underneath, and the honest answer is to publish nothing until
 * someone looks.
 */
export function parseGenericRdata(data: string): Uint8Array | null {
	const match = /^\\?#\s+(\d+)\s+([0-9a-fA-F][0-9a-fA-F\s]*)$/.exec(data.trim());
	if (match === null) return null;

	const declaredLength = Number.parseInt(match[1] as string, 10);
	const hex = (match[2] as string).replace(/\s+/g, "");
	if (hex.length !== declaredLength * 2) return null;

	const bytes = new Uint8Array(declaredLength);
	for (let i = 0; i < declaredLength; i++) {
		bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

/** The generic form straight to a record. */
export function parseLocAnswer(data: string): LocRecord | null {
	const bytes = parseGenericRdata(data);
	return bytes === null ? null : decodeLocWire(bytes);
}

// --- presentation format ----------------------------------------------------

function formatAxis(thousandths: number, axis: "latitude" | "longitude"): string {
	const { degrees, minutes, seconds, direction } = toSexagesimal(thousandths, axis);
	return `${degrees} ${minutes} ${seconds.toFixed(3)} ${direction}`;
}

function formatMetres(metres: number): string {
	return `${Number.isInteger(metres) ? metres : Number(metres.toFixed(2))}m`;
}

/**
 * The record as `dig` prints it, so a reader can compare the string on the
 * page with the string in their terminal character for character.
 */
export function formatLoc(record: LocRecord): string {
	return [
		formatAxis(record.latitude, "latitude"),
		formatAxis(record.longitude, "longitude"),
		`${record.altitudeMetres.toFixed(2)}m`,
		formatMetres(record.sizeMetres),
		formatMetres(record.horizontalPrecisionMetres),
		formatMetres(record.verticalPrecisionMetres),
	].join(" ");
}

// --- the Cloudflare DNS API shape -------------------------------------------

/** The `data` object the Cloudflare DNS API takes for a LOC record. */
export interface CloudflareLocData {
	readonly lat_degrees: number;
	readonly lat_minutes: number;
	readonly lat_seconds: number;
	readonly lat_direction: "N" | "S";
	readonly long_degrees: number;
	readonly long_minutes: number;
	readonly long_seconds: number;
	readonly long_direction: "E" | "W";
	readonly altitude: number;
	readonly size: number;
	readonly precision_horz: number;
	readonly precision_vert: number;
}

export function toCloudflareLocData(record: LocRecord): CloudflareLocData {
	const latitude = toSexagesimal(record.latitude, "latitude");
	const longitude = toSexagesimal(record.longitude, "longitude");
	return {
		lat_degrees: latitude.degrees,
		lat_minutes: latitude.minutes,
		lat_seconds: latitude.seconds,
		lat_direction: latitude.direction as "N" | "S",
		long_degrees: longitude.degrees,
		long_minutes: longitude.minutes,
		long_seconds: longitude.seconds,
		long_direction: longitude.direction as "E" | "W",
		altitude: record.altitudeMetres,
		size: record.sizeMetres,
		precision_horz: record.horizontalPrecisionMetres,
		precision_vert: record.verticalPrecisionMetres,
	};
}
