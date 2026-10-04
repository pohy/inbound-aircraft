import { type CSSProperties, useEffect, useState } from "react";
import { DRIFT_S, drawn, edge, overheadAt, project, vmin } from "./radar";
import type { Aircraft } from "./routes/api.aircraft";
import type { Settings } from "./settings";

const FADE_S = 3; // landed planes fade out over this, or the poll interval if shorter

const tint = (a: Aircraft) => (a.alt === "ground" ? "#acacac" : "white");
const ident = (a: Aircraft) =>
	[a.flight || a.hex, a.type].filter(Boolean).join(" • ");

export function Plane({
	aircraft: a,
	prev,
	polledAt,
	settings: s,
}: {
	aircraft: Aircraft;
	prev?: Aircraft; // same plane in the previous poll, aged to polledAt
	polledAt: number;
	settings: Settings;
}) {
	const { x, y, vx, vy } = project(a, s);
	const round = (v: number | undefined, unit: string) =>
		v == null ? "-" : Math.round(v) + unit;

	// Drift: distance flown along track in DRIFT_S at ground speed, animated linearly.
	// Settle: start where the previous poll drew the plane and ease onto the new track instead of jumping.
	// ponytail: ignores a settle/turn still running from the previous poll, only matters when polling faster than 1s
	const [nx, ny] = drawn(a, s);
	const [px, py] = prev ? drawn(prev, s) : [nx, ny];
	const move = {
		"--dx": vmin(vx * DRIFT_S),
		"--dy": vmin(vy * DRIFT_S),
		"--sx": vmin(px - nx),
		"--sy": vmin(py - ny),
		animationDelay: `${-(a.seenPos ?? 0)}s, 0s`, // the fix is already seenPos seconds old
	} as CSSProperties;
	const turn = {
		"--turn": `${prev?.track == null || a.track == null ? 0 : ((prev.track - a.track + 540) % 360) - 180}deg`, // shortest way round
	} as CSSProperties;

	const eta = overheadAt(a, s, polledAt);

	return (
		<div
			// Only grounded planes left on screen with Only airborne are ones that just landed.
			className={`absolute top-1/2 left-1/2 ${s.onlyAirborne && a.alt === "ground" ? "animate-fade-out" : ""}`}
			style={{
				translate: `${vmin(x)} ${vmin(y)}`,
				animationDuration: `${Math.min(FADE_S, s.poll)}s`,
			}}
		>
			{/* Own compositor layer, so it moves in sub-pixel steps. Inside the radar SVG, text snapped to whole pixels. */}
			<div
				style={move}
				className="will-change-transform motion-safe:animate-move"
			>
				<svg
					viewBox="-50 -50 100 100"
					className="absolute -top-[5vmin] -left-[5vmin] size-[10vmin] overflow-visible"
					fill={tint(a)}
					stroke={tint(a)}
					opacity={eta == null ? 0.7 : undefined} // not inbound
				>
					<circle r={5} fill="none" />
					{a.track != null && (
						<line
							y1={-5}
							y2={-25}
							transform={`rotate(${a.track})`}
							style={turn}
							className="motion-safe:animate-turn"
						/>
					)}
					<text x={10} y={-6} fontSize={13} stroke="none">
						<tspan>
							{/* {a.flight || a.hex} • {a.type} */}
							{ident(a)}
						</tspan>
						<tspan x={10} dy={15}>
							{round(a.track, "°")}&nbsp;
							{a.alt === "ground" ? "GND" : round(a.alt, "ft")}&nbsp;
							{round(a.gs, "kt")}
						</tspan>
						{eta != null && (
							<Eta {...eta} x={10} dy={15} />
						)}
					</text>
				</svg>
			</div>
		</div>
	);
}

// Zoomed in: a dot on the screen edge toward each plane off screen.
export function EdgeMarkers({
	aircraft,
	polledAt,
	settings,
}: {
	aircraft: Aircraft[];
	polledAt: number;
	settings: Settings;
}) {
	const vm = Math.min(innerWidth, innerHeight) / 100; // 1vmin in px
	return (
		<svg className="pointer-events-none fixed inset-0 h-full w-full">
			{aircraft.map((a) => {
				const p = edge(a, settings, vm);
				if (!p) return null;
				const right = p[0] > innerWidth / 2; // label points back inward
				// The dot sits on the ray from the screen center, so the aircraft lies further along it.
				const toward = Math.atan2(
					p[1] - innerHeight / 2,
					p[0] - innerWidth / 2,
				);
				const eta = overheadAt(a, settings, polledAt);
				return (
					<g
						key={a.hex}
						transform={`translate(${p[0]} ${p[1]})`}
						fill={tint(a)}
						opacity={eta == null ? 0.8 : undefined} // not inbound
					>
						<circle r={vm * 0.4} />
						<line
							x1={vm * 0.4}
							x2={vm * 1.6}
							stroke={tint(a)}
							transform={`rotate(${(toward * 180) / Math.PI})`}
						/>
						<text
							x={right ? -vm : vm}
							dy={eta == null ? "0.35em" : "-0.25em"} // centers one or two lines on the dot
							fontSize={vm * 1.3}
							textAnchor={right ? "end" : "start"}
						>
							{ident(a)}
							{eta != null && (
								<Eta {...eta} x={right ? -vm : vm} dy="1.2em" />
							)}
						</text>
					</g>
				);
			})}
		</svg>
	);
}

// Counts down to `at` (epoch ms), then negative until the plane leaves the overhead circle at `until`, then hides.
// x, dy: placement of its line within the parent <text>.
function Eta({
	at,
	until,
	x,
	dy,
}: {
	at: number;
	until: number;
	x: number;
	dy: number | string;
}) {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, []);
	if (now > until) return null;
	return (
		<tspan x={x} dy={dy}>
			ETA {clock(at, now)}
		</tspan>
	);
}

// Time left until `at` (epoch ms) as m:ss, negative once past.
export function clock(at: number, now: number) {
	const left = Math.ceil((at - now) / 1000);
	const abs = Math.abs(left);
	return `${left < 0 ? "-" : ""}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}
