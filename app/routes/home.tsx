import { type CSSProperties, useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { BaseMap } from "../map.client";
import { overheadIn } from "../overhead";
import type { Route } from "./+types/home";
import type { Aircraft, loader as aircraftLoader } from "./api.aircraft";

type Settings = {
	lat: number;
	lon: number;
	radius: number;
	poll: number;
	overhead: number; // NM a track must pass within to count as overflying
	onlyAirborne: boolean;
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
	onlyAirborne: false,
};
const STORAGE_KEY = "settings";
const FIELDS = [
	["lat", "Lat", -90, 90],
	["lon", "Lon", -180, 180],
	["radius", "Radius (NM)", 1, 250],
	["poll", "Poll (s)", 1, 3600],
	["overhead", "Overhead (NM)", 0.1, 50],
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
	const fetcher = useFetcher<typeof aircraftLoader>();
	const save = (next: Settings) => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		setSettings(next);
	};

	const { lat, lon, radius, poll: every } = settings;
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

	return (
		<main>
			<BaseMap lat={lat} lon={lon} radius={radius} span={RANGE / VIEW} />
			<svg
				viewBox={`${-VIEW / 2} ${-VIEW / 2} ${VIEW} ${VIEW}`}
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
				<circle r={3} fill="white" fillOpacity={0.2} />
			</svg>
			<div className="pointer-events-none fixed inset-0 font-mono">
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

			<form
				className="fixed top-2 left-2 flex flex-wrap items-end gap-2 text-xs"
				onSubmit={(e) => {
					e.preventDefault();
					save({
						...settings,
						...Object.fromEntries(
							[...new FormData(e.currentTarget)].map(([k, v]) => [
								k,
								Number(v),
							]),
						),
					});
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
							save({ ...settings, onlyAirborne: e.target.checked })
						}
					/>
					Only airborne
				</label>
				<span className="w-full">
					{visible.length}/{poll.aircraft.length} aircraft · elev{" "}
					{elevation == null ? "-" : `${Math.round(elevation)}ft`}
					{error && <span className="ml-2 text-red-400">{error}</span>}
				</span>
			</form>
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

// viewBox units as CSS length: the radar SVG scales VIEW to the viewport's short side.
const vmin = (v: number) => `${(v * 100) / VIEW}vmin`;

// Where the drift animation draws a plane once its fix is seenPos seconds old.
function drawn(a: Aircraft, s: Settings) {
	const { x, y, vx, vy } = project(a, s);
	const t = Math.min(DRIFT_S, a.seenPos ?? 0);
	return [x + vx * t, y + vy * t];
}

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
	const { east, north, x, y, vx, vy } = project(a, s);
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

	const overhead =
		a.alt === "ground" || a.track == null
			? undefined
			: overheadIn(east, north, a.track, a.gs ?? 0, s.overhead);

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
					fill="white"
					stroke="white"
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
							{[a.flight || a.hex, a.type].filter(Boolean).join(" • ")}
						</tspan>
						<tspan x={10} dy={15}>
							{round(a.track, "°")}&nbsp;
							{a.alt === "ground" ? "GND" : round(a.alt, "ft")}&nbsp;
							{round(a.gs, "kt")}
						</tspan>
						{overhead != null && (
							<Eta at={polledAt + (overhead - (a.seenPos ?? 0)) * 1000} />
						)}
					</text>
				</svg>
			</div>
		</div>
	);
}

// Counts down to `at` (epoch ms), gone once overflown.
function Eta({ at }: { at: number }) {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, []);
	const left = Math.ceil((at - now) / 1000);
	if (left <= 0) return null;
	return (
		<tspan x={10} dy={15}>
			ETA {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
		</tspan>
	);
}
