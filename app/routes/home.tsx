import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { BaseMap } from "../map.client";
import { overheadIn } from "../overhead";
import { HOME, spread, toEdge, type View, zoomed } from "../view";
import type { Route } from "./+types/home";
import type { Aircraft, loader as aircraftLoader } from "./api.aircraft";

type Settings = {
	lat: number;
	lon: number;
	radius: number;
	poll: number;
	overhead: number; // NM a track must pass within to count as overflying
	outbound: number; // s to keep a negative ETA after overflying
	onlyAirborne: boolean;
	view: View;
};

type Poll = {
	aircraft: Aircraft[];
	at: number; // arrival, epoch ms
	prev: Map<string, Aircraft>; // by hex
};

const DEFAULTS: Settings = {
	lat: 51.47,
	lon: -0.4543,
	radius: 25,
	poll: 10,
	overhead: 1,
	outbound: 30,
	onlyAirborne: false,
	view: HOME,
};
const STORAGE_KEY = "settings";
const FIELDS = [
	["lat", "Lat", -90, 90],
	["lon", "Lon", -180, 180],
	["radius", "Radius (NM)", 1, 250],
	["poll", "Poll (s)", 1, 3600],
	["overhead", "Overhead (NM)", 0.1, 50],
	["outbound", "Outbound (s)", 0, 3600],
] as const;

const VIEW = 1000; // SVG viewBox size
const RANGE = VIEW * 0.45; // radius circle in viewBox units
// ponytail: dead-reckon at most this far past a fix, then freeze until new data. Matches --animate-move in app.css.
const DRIFT_S = 60;
const FADE_S = 3; // landed planes fade out over this, or the poll interval if shorter

export function meta({}: Route.MetaArgs) {
	return [{ title: "Inbound aircraft" }];
}

// Settings live in localStorage, so the page only renders on the client.
export function clientLoader(): Settings {
	try {
		return {
			...DEFAULTS,
			...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"),
		};
	} catch {
		return DEFAULTS;
	}
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return null;
}

export default function Home({ loaderData }: Route.ComponentProps) {
	const [settings, setSettings] = useState(loaderData);
	useEffect(
		() => localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)),
		[settings],
	);
	const fetcher = useFetcher<typeof aircraftLoader>();

	const { lat, lon, radius, poll: every, view } = settings;
	useEffect(() => {
		const load = () =>
			fetcher.load(`/api/aircraft?lat=${lat}&lon=${lon}&radius=${radius}`);
		load();
		const id = setInterval(load, every * 1000);
		return () => clearInterval(id);
	}, [lat, lon, radius, every]);

	// Ground elevation at the chosen point, in ft like aircraft altitudes. Open-Meteo allows CORS, so no proxy.
	const [elevation, setElevation] = useState<number>();
	useEffect(() => {
		const ctrl = new AbortController();
		setElevation(undefined);
		fetch(
			`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`,
			{ signal: ctrl.signal },
		)
			.then((r) => r.json())
			.then((d: { elevation: number[] }) =>
				setElevation(d.elevation[0] / 0.3048),
			)
			.catch(() => {}); // ponytail: shows "-" on failure, no retry
		return () => ctrl.abort();
	}, [lat, lon]);

	// Keep the last good aircraft on screen when a poll fails (adsb.lol 429s easily).
	// prev: the poll before, aged to this one's arrival, so each plane can glide on from where it was drawn.
	const [poll, setPoll] = useState<Poll>({
		aircraft: [],
		at: 0,
		prev: new Map(),
	});
	const result = fetcher.data;
	useEffect(() => {
		if (result && "aircraft" in result) {
			const at = Date.now();
			setPoll((last) => ({
				aircraft: result.aircraft,
				at,
				prev: new Map(
					last.aircraft.map((a) => [
						a.hex,
						{ ...a, seenPos: (a.seenPos ?? 0) + (at - last.at) / 1000 },
					]),
				),
			}));
		}
	}, [result]);
	const error = result && "error" in result ? result.error : undefined;
	// Only airborne hides grounded planes, except ones that just landed: those fade out.
	const visible = poll.aircraft.filter((a) => {
		const before = poll.prev.get(a.hex);
		return (
			!settings.onlyAirborne ||
			a.alt !== "ground" ||
			(before != null && before.alt !== "ground")
		);
	});

	// Functional update: several pointer moves can land before a render.
	const zoom = (f: number, around: [number, number], by: [number, number]) =>
		setSettings((s) => ({ ...s, view: zoomed(s.view, f, around, by, RANGE) }));
	// Pointers held down, by pointerId.
	const pointers = useRef(new Map<number, [number, number]>());
	const vm = Math.min(innerWidth, innerHeight) / 100; // 1vmin in px

	return (
		<main>
			{/* Centered on the view center, mapped back through the flat projection; zoom k fits radius/k NM. */}
			{/* ponytail: flat vs Mercator scale differs ~tan(lat)·Δlat away from the user, so zoomed far off center planes
			    sit up to ~1% of the screen off the map (more at big radii). Project planes through Leaflet if it shows. */}
			<BaseMap
				lat={lat - (view.y * radius) / RANGE / 60}
				lon={
					lon + (view.x * radius) / RANGE / 60 / Math.cos((lat * Math.PI) / 180)
				}
				radius={radius / view.k}
				span={RANGE / VIEW}
			/>
			<svg
				viewBox={`${view.x - VIEW / 2 / view.k} ${view.y - VIEW / 2 / view.k} ${VIEW / view.k} ${VIEW / view.k}`}
				className="pointer-events-none fixed inset-0 h-full w-full"
			>
				{/* Dims the map outside the radius: a square well past any viewport aspect, with the circle cut out. */}
				<path
					d={`M${-VIEW * 5} ${-VIEW * 5}H${VIEW * 5}V${VIEW * 5}H${-VIEW * 5}Z
						M0 ${-RANGE}A${RANGE} ${RANGE} 0 0 0 0 ${RANGE}A${RANGE} ${RANGE} 0 0 0 0 ${-RANGE}Z`}
					fillRule="evenodd"
					fillOpacity={0.5}
				/>
				{/* New key per poll remounts the circle, restarting the animation. */}
				<circle
					key={poll.at}
					r={RANGE}
					fill="none"
					stroke="white"
					vectorEffect="non-scaling-stroke"
					className="opacity-0 motion-safe:animate-pulse-out"
				/>
				{/* Overhead tolerance: tracks passing through this get an ETA. Geographic, so it scales with zoom. */}
				<circle
					r={(settings.overhead * RANGE) / radius}
					fill="white"
					fillOpacity={0.03}
					stroke="white"
					strokeWidth={1 / view.k}
					strokeOpacity={0.1}
				/>
				<circle r={3 / view.k} fill="white" fillOpacity={0.2} />
			</svg>
			<div
				className="pointer-events-none fixed inset-0"
				// --k scales positions and drift (see vmin), not the markers themselves.
				style={
					{
						"--k": view.k,
						translate: `${vmin(-view.x)} ${vmin(-view.y)}`,
					} as CSSProperties
				}
			>
				{/* New key per poll remounts each plane, restarting its drift from the fresh position. */}
				{visible.map((a) => (
					<Plane
						key={`${a.hex}-${poll.at}`}
						aircraft={a}
						prev={poll.prev.get(a.hex)}
						polledAt={poll.at}
						settings={settings}
					/>
				))}
			</div>
			{/* Zoomed in: a dot on the screen edge toward each plane off screen. */}
			<svg className="pointer-events-none fixed inset-0 h-full w-full">
				{visible.map((a) => {
					const p = edge(a, settings, vm);
					if (!p) return null;
					const right = p[0] > innerWidth / 2; // label points back inward
					// The dot sits on the ray from the screen center, so the aircraft lies further along it.
					const toward = Math.atan2(
						p[1] - innerHeight / 2,
						p[0] - innerWidth / 2,
					);
					const eta = overheadAt(a, settings, poll.at);
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
									<Eta
										at={eta}
										outbound={settings.outbound}
										x={right ? -vm : vm}
										dy="1.2em"
									/>
								)}
							</text>
						</g>
					);
				})}
			</svg>
			{/* Gestures: wheel zooms at the cursor, drag pans, two fingers pinch. */}
			<div
				className="fixed inset-0 touch-none select-none"
				onWheel={(e) =>
					zoom(2 ** ((-e.deltaY * (e.deltaMode ? 33 : 1)) / 200), at(e), [0, 0])
				}
				onPointerDown={(e) => {
					e.currentTarget.setPointerCapture(e.pointerId);
					pointers.current.set(e.pointerId, at(e));
				}}
				onPointerMove={(e) => {
					const ps = pointers.current;
					if (!ps.has(e.pointerId)) return;
					const [c0, r0] = spread([...ps.values()]);
					ps.set(e.pointerId, at(e));
					const [c1, r1] = spread([...ps.values()]);
					zoom(r0 ? r1 / r0 : 1, c0, [c1[0] - c0[0], c1[1] - c0[1]]);
				}}
				onPointerUp={(e) => pointers.current.delete(e.pointerId)}
				onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
			/>

			<details className="fixed top-2 left-2 text-xs opacity-50 open:opacity-100">
				<summary className="cursor-pointer list-none text-sm [&::-webkit-details-marker]:hidden">
					CONF
				</summary>
				<form
					className="mt-2 flex flex-wrap items-end gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						const next = {
							...settings,
							...Object.fromEntries(
								[...new FormData(e.currentTarget)].map(([k, v]) => [
									k,
									Number(v),
								]),
							),
						};
						// A new point or radius starts from the fit-to-radius view.
						setSettings(
							next.lat === lat && next.lon === lon && next.radius === radius
								? next
								: { ...next, view: HOME },
						);
					}}
				>
					{FIELDS.map(([name, label, min, max]) => (
						<label key={name} className="flex flex-col gap-1">
							{label}
							<input
								name={name}
								type="number"
								step="any"
								min={min}
								max={max}
								required
								defaultValue={settings[name]}
								className="w-28 border border-white bg-black px-1 py-0.5 text-sm"
							/>
						</label>
					))}
					<button className="border border-white px-2 py-0.5 text-sm">
						Apply
					</button>
					{/* Unnamed, so FormData skips it; applies instantly without a refetch. */}
					<label className="flex items-center gap-1 text-sm">
						<input
							type="checkbox"
							checked={settings.onlyAirborne}
							onChange={(e) =>
								setSettings({ ...settings, onlyAirborne: e.target.checked })
							}
						/>
						Only airborne
					</label>
				</form>
			</details>
			<span className="fixed bottom-2 left-2 text-xs">
				{visible.length}/{poll.aircraft.length} aircraft · elev{" "}
				{elevation == null ? "-" : `${Math.round(elevation)}ft`}
				{error && <span className="ml-2 text-red-400">{error}</span>}
			</span>
		</main>
	);
}

// Fix position (NM and viewBox units) and velocity (units/s) of a plane.
function project(a: Aircraft, s: Settings) {
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
const vmin = (v: number) => `calc(${(v * 100) / VIEW}vmin * var(--k))`;

// Pointer as a screen offset from the viewport center, in viewBox units at k = 1.
function at(e: { clientX: number; clientY: number }): [number, number] {
	const unit = Math.min(innerWidth, innerHeight) / VIEW; // px
	return [
		(e.clientX - innerWidth / 2) / unit,
		(e.clientY - innerHeight / 2) / unit,
	];
}

// Where the drift animation draws a plane once its fix is seenPos seconds old.
function drawn(a: Aircraft, s: Settings) {
	const { x, y, vx, vy } = project(a, s);
	const t = Math.min(DRIFT_S, a.seenPos ?? 0);
	return [x + vx * t, y + vy * t];
}

// Point on the screen edge (px, inset 2vmin) toward a plane drawn off screen, or undefined while it's on screen.
// ponytail: uses the fix, not the live drift; a plane crossing the edge between polls, or a window resize,
// catches up on the next poll, zoom or pan
function edge(a: Aircraft, s: Settings, vm: number) {
	const [x, y] = drawn(a, s);
	const unit = (vm * 100 * s.view.k) / VIEW; // px per viewBox unit
	const [w, h] = [innerWidth / 2, innerHeight / 2];
	const p = toEdge((x - s.view.x) * unit, (y - s.view.y) * unit, w, h, 2 * vm);
	return p && [w + p[0], h + p[1]];
}

// When a plane holding its track passes overhead (epoch ms), or undefined if it won't
// or passed longer than the outbound window ago.
function overheadAt(a: Aircraft, s: Settings, polledAt: number) {
	if (a.alt === "ground" || a.track == null) return;
	const { east, north } = project(a, s);
	const t = overheadIn(east, north, a.track, a.gs ?? 0, s.overhead);
	if (t == null) return;
	const at = polledAt + (t - (a.seenPos ?? 0)) * 1000;
	return at > polledAt - s.outbound * 1000 ? at : undefined;
}

const tint = (a: Aircraft) => (a.alt === "ground" ? "#acacac" : "white");
const ident = (a: Aircraft) =>
	[a.flight || a.hex, a.type].filter(Boolean).join(" • ");

function Plane({
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
					opacity={eta == null ? 0.8 : undefined} // not inbound
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
							<Eta at={eta} outbound={s.outbound} x={10} dy={15} />
						)}
					</text>
				</svg>
			</div>
		</div>
	);
}

// Counts down to `at` (epoch ms), then negative for `outbound` s after overflying, then hides.
// x, dy: placement of its line within the parent <text>.
function Eta({
	at,
	outbound,
	x,
	dy,
}: {
	at: number;
	outbound: number;
	x: number;
	dy: number | string;
}) {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, []);
	const left = Math.ceil((at - now) / 1000);
	if (left < -outbound) return null;
	const abs = Math.abs(left);
	return (
		<tspan x={x} dy={dy}>
			ETA {left < 0 && "-"}
			{Math.floor(abs / 60)}:{String(abs % 60).padStart(2, "0")}
		</tspan>
	);
}
