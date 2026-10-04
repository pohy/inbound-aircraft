// Config the CONF form edits, with input bounds. A share link carries these plus onlyAirborne.
export const FIELDS = [
	["lat", "Lat", -90, 90],
	["lon", "Lon", -180, 180],
	["radius", "Radius (NM)", 1, 250],
	["poll", "Poll (s)", 1, 3600],
	["overhead", "Overhead (NM)", 0.1, 50],
] as const;

type Shared = Record<(typeof FIELDS)[number][0], number> & {
	onlyAirborne: boolean;
};

export const toQuery = (s: Shared) =>
	new URLSearchParams([
		...FIELDS.map(([name]) => [name, String(s[name])]),
		["onlyAirborne", String(s.onlyAirborne)],
	]);

// Removes the share params from url, returning the config only if all are there and in bounds.
export function takeShared(url: URL): Shared | undefined {
	const q = url.searchParams;
	const air = q.get("onlyAirborne");
	const out = { onlyAirborne: air === "true" } as Shared;
	let ok = air === "true" || air === "false";
	for (const [name, , min, max] of FIELDS) {
		out[name] = Number(q.get(name) || NaN); // missing and "" are NaN, not 0
		ok &&= out[name] >= min && out[name] <= max;
		q.delete(name);
	}
	q.delete("onlyAirborne");
	return ok ? out : undefined;
}
