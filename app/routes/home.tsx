import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import type { Route } from "./+types/home";
import type { Aircraft, loader as aircraftLoader } from "./api.aircraft";

type Settings = {
	lat: number;
	lon: number;
	radius: number;
	poll: number;
	airborne: boolean;
	grounded: boolean;
};

const DEFAULTS: Settings = {
	lat: 51.47,
	lon: -0.4543,
	radius: 25,
	poll: 10,
	airborne: true,
	grounded: true,
};
const STORAGE_KEY = "settings";
const FIELDS = [
	["lat", "Lat", -90, 90],
	["lon", "Lon", -180, 180],
	["radius", "Radius (NM)", 1, 250],
	["poll", "Poll (s)", 1, 3600],
] as const;

const VIEW = 1000; // SVG viewBox size
const RANGE = VIEW * 0.45; // radius circle in viewBox units

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

	const { lat, lon, radius, poll } = settings;
	useEffect(() => {
		const load = () =>
			fetcher.load(`/api/aircraft?lat=${lat}&lon=${lon}&radius=${radius}`);
		load();
		const id = setInterval(load, poll * 1000);
		return () => clearInterval(id);
	}, [lat, lon, radius, poll]);

	// Keep the last good aircraft on screen when a poll fails (adsb.lol 429s easily).
	const [aircraft, setAircraft] = useState<Aircraft[]>([]);
	const [pulse, setPulse] = useState(0);
	const result = fetcher.data;
	useEffect(() => {
		if (result && "aircraft" in result) {
			setAircraft(result.aircraft);
			setPulse((n) => n + 1); // same render as the new positions
		}
	}, [result]);
	const error = result && "error" in result ? result.error : undefined;
	const visible = aircraft.filter((a) =>
		a.alt === "ground" ? settings.grounded : settings.airborne,
	);

	return (
		<main>
			<svg
				viewBox={`${-VIEW / 2} ${-VIEW / 2} ${VIEW} ${VIEW}`}
				className="fixed inset-0 h-full w-full font-mono"
			>
				<circle r={RANGE} fill="none" stroke="white" strokeOpacity={0.4} />
				{/* New key per poll remounts the circle, restarting the animation. */}
				<circle
					key={pulse}
					r={RANGE}
					fill="none"
					stroke="white"
					vectorEffect="non-scaling-stroke"
					className="opacity-0 motion-safe:animate-pulse-out"
				/>
				{/* <circle r={3} fill="white" /> */}
				{visible.map((a) => (
					<Plane key={a.hex} aircraft={a} settings={settings} />
				))}
			</svg>

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
				{/* Unnamed, so FormData skips them; they apply instantly without a refetch. */}
				{(["airborne", "grounded"] as const).map((key) => (
					<label
						key={key}
						className="flex items-center gap-1 text-sm capitalize"
					>
						<input
							type="checkbox"
							checked={settings[key]}
							onChange={(e) => save({ ...settings, [key]: e.target.checked })}
						/>
						{key}
					</label>
				))}
				<span className="w-full">
					{visible.length}/{aircraft.length} aircraft
					{error && <span className="ml-2 text-red-400">{error}</span>}
				</span>
			</form>
		</main>
	);
}

function Plane({
	aircraft: a,
	settings: s,
}: {
	aircraft: Aircraft;
	settings: Settings;
}) {
	// ponytail: flat projection around the user, fine within the API's 250 NM cap
	const scale = RANGE / s.radius; // viewBox units per NM
	const dLon = ((a.lon - s.lon + 540) % 360) - 180; // wraps across the antimeridian
	const x = dLon * 60 * Math.cos((s.lat * Math.PI) / 180) * scale;
	const y = -(a.lat - s.lat) * 60 * scale;
	const round = (v: number | undefined, unit: string) =>
		v == null ? "-" : Math.round(v) + unit;

	return (
		<g transform={`translate(${x} ${y})`} fill="white" stroke="white">
			<circle r={5} fill="none" />
			{a.track != null && (
				<line y1={-5} y2={-25} transform={`rotate(${a.track})`} />
			)}
			<text x={10} y={-6} fontSize={13} stroke="none">
				<tspan>
					{a.flight || a.hex} • {a.type}
				</tspan>
				<tspan x={10} dy={15}>
					{round(a.track, "°")}&nbsp;
					{a.alt === "ground" ? "GND" : round(a.alt, "ft")}&nbsp;
					{round(a.gs, "kt")}
				</tspan>
			</text>
		</g>
	);
}
