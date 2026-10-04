// Radar zoom: k magnifies the fit-to-radius view, (x, y) is the view center in viewBox units from the radar center.
export type View = { k: number; x: number; y: number };
export const HOME: View = { k: 1, x: 0, y: 0 };
const MAX_K = 16;

// Zoom by f around `at`, then pan by `by`: screen offsets from the viewport center, in viewBox units at k = 1.
// The center stays inside a circle that shrinks to the radar center as k → 1, so zooming fully out resets the view.
export function zoomed(
	v: View,
	f: number,
	at: [number, number],
	by: [number, number],
	range: number, // radius circle in viewBox units
): View {
	const k = Math.min(MAX_K, Math.max(1, v.k * f));
	const x = v.x + at[0] * (1 / v.k - 1 / k) - by[0] / k;
	const y = v.y + at[1] * (1 / v.k - 1 / k) - by[1] / k;
	const lim = range * (1 - 1 / k);
	const d = Math.hypot(x, y);
	return d > lim ? { k, x: (x * lim) / d, y: (y * lim) / d } : { k, x, y };
}

// Centroid of the pointers and their mean distance to it: one pointer pans, two also pinch-zoom.
export function spread(ps: [number, number][]): [[number, number], number] {
	const cx = ps.reduce((s, p) => s + p[0], 0) / ps.length;
	const cy = ps.reduce((s, p) => s + p[1], 0) / ps.length;
	const r =
		ps.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / ps.length;
	return [[cx, cy], r];
}

// Where the ray from the screen center toward (dx, dy) meets the screen edge, `inset` in,
// or undefined while that point is on screen. All px from the center; w, h: half the screen.
export function toEdge(
	dx: number,
	dy: number,
	w: number,
	h: number,
	inset: number,
): [number, number] | undefined {
	if (Math.abs(dx) <= w && Math.abs(dy) <= h) return;
	const f = Math.min((w - inset) / Math.abs(dx), (h - inset) / Math.abs(dy));
	return [dx * f, dy * f];
}
