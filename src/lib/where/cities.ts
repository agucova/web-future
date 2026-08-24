/**
 * The closed list of cities the site is able to name, and the coarse
 * coordinates it publishes for each of them.
 *
 * Everything about a published location comes from this table, so the whole
 * of what the site can ever say about where Agus is fits on one reviewable
 * screen and lands in git history rather than being typed at a prompt. The
 * CLI takes an id from here and nothing else, which is what makes "publish a
 * street address" not a mistake that can be made.
 *
 * Adding a city:
 *   - `latitude` and `longitude` are decimal degrees of the city centre,
 *     positive north and east. Two decimal places is plenty; the publisher
 *     rounds to whole arcminutes before anything reaches DNS.
 *   - `sizeMetres` is the rough diameter of the built-up area. RFC 1876 can
 *     only express one significant digit (2 x 10^6 cm and so on), so pick a
 *     figure like 20000 or 60000. `tests/where.test.ts` fails on anything
 *     that would have to be rounded.
 *
 * Imported by the Worker, so it must stay pure data.
 */

export interface City {
	/** Stable id, and the argument `scripts/where.ts set` takes. */
	readonly id: string;
	readonly name: string;
	readonly country: string;
	/** Decimal degrees, positive north. */
	readonly latitude: number;
	/** Decimal degrees, positive east. */
	readonly longitude: number;
	/** Rough diameter of the urban area, in metres. One significant digit. */
	readonly sizeMetres: number;
}

export const CITIES: readonly City[] = [
	{ id: "berkeley", name: "Berkeley", country: "United States", latitude: 37.87, longitude: -122.27, sizeMetres: 20_000 },
	{
		id: "san-francisco",
		name: "San Francisco",
		country: "United States",
		latitude: 37.77,
		longitude: -122.42,
		sizeMetres: 20_000,
	},
	{ id: "new-york", name: "New York", country: "United States", latitude: 40.71, longitude: -74.01, sizeMetres: 40_000 },
	{ id: "boston", name: "Boston", country: "United States", latitude: 42.36, longitude: -71.06, sizeMetres: 20_000 },
	{ id: "santiago", name: "Santiago", country: "Chile", latitude: -33.45, longitude: -70.65, sizeMetres: 60_000 },
	{ id: "london", name: "London", country: "United Kingdom", latitude: 51.51, longitude: -0.13, sizeMetres: 50_000 },
	{ id: "oxford", name: "Oxford", country: "United Kingdom", latitude: 51.75, longitude: -1.26, sizeMetres: 10_000 },
];

export function cityById(id: string): City | null {
	return CITIES.find((city) => city.id === id) ?? null;
}
