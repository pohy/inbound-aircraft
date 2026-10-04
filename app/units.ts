// Settings and aircraft data stay in aeronautical units; metric only changes what's shown and typed.
const METRIC: Record<string, [string, number]> = {
	NM: ["km", 1.852],
	ft: ["m", 0.3048],
	kt: ["km/h", 1.852],
};

// Display unit and factor for a value stored in unit u. Units without a metric stand-in (s, °) pass through.
export const unit = (u: string, metric: boolean): [string, number] =>
	(metric && METRIC[u]) || [u, 1];

// A stored value as a form input shows it: 25 NM reads 46.3 km, not 46.300000000000004.
export const shown = (v: number, f: number) =>
	f === 1 ? v : Number((v * f).toPrecision(4));

// A form input back in stored units. Unchanged input keeps the exact stored value, so display rounding isn't an edit.
// Converted values keep 6 significant digits: tidy share links, and bounds round trip (0.1852 km is 0.1 NM, not 0.0999…).
export function typed(input: number, stored: number, f: number) {
	if (f === 1) return input;
	if (input === shown(stored, f)) return stored;
	return Number((input / f).toPrecision(6));
}
