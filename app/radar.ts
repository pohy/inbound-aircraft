import { overheadIn } from "./overhead";
import type { Aircraft } from "./routes/api.aircraft";
import type { Settings } from "./settings";
import { toEdge } from "./view";

export const VIEW = 1000; // SVG viewBox size
export const RANGE = VIEW * 0.45; // radius circle in viewBox units
// ponytail: dead-reckon at most this far past a fix, then freeze until new data. Matches --animate-move in app.css.
export const DRIFT_S = 60;

// Fix position (NM and viewBox units) and velocity (units/s) of a plane.
export function project(a: Aircraft, s: Settings) {
	// ponytail: flat projection around the user, fine within the API's 250 NM cap
	const scale = RANGE / s.radius; // viewBox units per NM
	const dLon = ((a.lon - s.lon + 540) % 360) - 180; // wraps across the antimeridian
	const east = dLon * 60 * Math.cos((s.lat * Math.PI) / 180); // NM
	const north = (a.lat - s.lat) * 60; // NM
	const speed = a.track == null ? 0 : ((a.gs ?? 0) / 3600) * scale;
	const rad = ((a.track ?? 0) * Math.PI) / 180;
	return {
		east,
		north,
		x: east * scale,
		y: -north * scale,
		vx: Math.sin(rad) * speed,
		vy: -Math.cos(rad) * speed,
	};
}

// viewBox units as CSS length: the radar SVG scales VIEW to the viewport's short side, magnified by zoom --k.
export const vmin = (v: number) => `calc(${(v * 100) / VIEW}vmin * var(--k))`;

// Radar box size in px: <main>, which fills the screen where innerHeight falls short (see .full-screen in app.css).
export function screenSize(): [number, number] {
	const m = document.querySelector("main");
	return m ? [m.clientWidth, m.clientHeight] : [innerWidth, innerHeight]; // before the first render
}

// Pointer as a screen offset from the radar box center, in viewBox units at k = 1.
export function at(e: { clientX: number; clientY: number }): [number, number] {
	const [w, h] = screenSize();
	const unit = Math.min(w, h) / VIEW; // px
	return [(e.clientX - w / 2) / unit, (e.clientY - h / 2) / unit];
}

// Where the drift animation draws a plane once its fix is seenPos seconds old.
export function drawn(a: Aircraft, s: Settings) {
	const { x, y, vx, vy } = project(a, s);
	const t = Math.min(DRIFT_S, a.seenPos ?? 0);
	return [x + vx * t, y + vy * t];
}

// Point on the screen edge (px, `inset` px in) toward a plane drawn off screen, or undefined while it's on screen.
// ponytail: uses the fix, not the live drift; a plane crossing the edge between polls, or a window resize,
// catches up on the next poll, zoom or pan
export function edge(a: Aircraft, s: Settings, vm: number, inset: number) {
	const [x, y] = drawn(a, s);
	const unit = (vm * 100 * s.view.k) / VIEW; // px per viewBox unit
	const [w, h] = screenSize().map((v) => v / 2);
	const p = toEdge((x - s.view.x) * unit, (y - s.view.y) * unit, w, h, inset);
	return p && [w + p[0], h + p[1]];
}

// When a plane holding its track passes overhead and leaves the overhead circle (epoch ms),
// or undefined if it won't pass or already left.
export function overheadAt(a: Aircraft, s: Settings, polledAt: number) {
	if (a.alt === "ground" || a.track == null) return;
	const { east, north } = project(a, s);
	const t = overheadIn(east, north, a.track, a.gs ?? 0, s.overhead);
	if (t == null) return;
	const epoch = (secs: number) => polledAt + (secs - (a.seenPos ?? 0)) * 1000;
	const until = epoch(t.exit);
	return until > polledAt ? { at: epoch(t.closest), until } : undefined;
}
