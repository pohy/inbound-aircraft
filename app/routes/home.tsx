import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Conf } from "../conf";
import { BaseMap } from "../map.client";
import { clock, EdgeMarkers, Plane } from "../plane";
import { at, overheadAt, RANGE, VIEW, vmin } from "../radar";
import { DEFAULTS, type Settings } from "../settings";
import { takeShared } from "../share";
import { unit } from "../units";
import { spread, zoomed } from "../view";
import type { Route } from "./+types/home";
import type { Aircraft, loader as aircraftLoader } from "./api.aircraft";

type Poll = {
	aircraft: Aircraft[];
	at: number; // arrival, epoch ms
	prev: Map<string, Aircraft>; // by hex
};

const STORAGE_KEY = "settings";
const TITLE = "Inbound aircraft";

export function meta({}: Route.MetaArgs) {
	return [{ title: TITLE }];
}

// Settings live in localStorage, so the page only renders on the client. A share link's config replaces them.
export function clientLoader(): Settings {
	const url = new URL(location.href);
	const shared = takeShared(url);
	history.replaceState(history.state, "", url); // keeps React Router's state
	let stored = DEFAULTS;
	try {
		stored = {
			...DEFAULTS,
			...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"),
		};
	} catch {}
	// Units are the viewer's own, so a share link keeps them.
	return shared ? { ...DEFAULTS, ...shared, metric: stored.metric } : stored;
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
		// A hidden tab renders no frames, so planes remounted by a poll then start drifting only on return, from the
		// poll's time. Restart them aged to now and poll at once (hidden timers may have run only once a minute).
		const onShow = () => {
			if (document.hidden) return;
			const now = Date.now();
			setPoll((p) => {
				const aged = p.aircraft.map((a) => ({
					...a,
					seenPos: (a.seenPos ?? 0) + (now - p.at) / 1000,
				}));
				// prev = self: no settle or turn
				return {
					aircraft: aged,
					at: now,
					prev: new Map(aged.map((a) => [a.hex, a])),
				};
			});
			load();
		};
		document.addEventListener("visibilitychange", onShow);
		return () => {
			clearInterval(id);
			document.removeEventListener("visibilitychange", onShow);
		};
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
	const elev = unit("ft", settings.metric);

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
	// Tab title counts down to the soonest upcoming overhead pass and names its type, so it reads from a background tab.
	// ponytail: Chrome slows timers in tabs hidden 5+ min to once a minute; tick from a Worker if that bites
	useEffect(() => {
		const etas = visible
			.flatMap((a) => {
				const e = overheadAt(a, settings, poll.at);
				return e ? [{ at: e.at, type: a.type }] : [];
			})
			.sort((p, q) => p.at - q.at);
		const tick = () => {
			const now = Date.now();
			const next = etas.find((e) => e.at > now); // passed ones skip to the next
			document.title = next
				? `[${[clock(next.at, now), next.type].filter(Boolean).join(" ")}] ${TITLE}`
				: TITLE;
		};
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	}, [poll, settings]);

	// Functional update: several pointer moves can land before a render.
	const zoom = (f: number, around: [number, number], by: [number, number]) =>
		setSettings((s) => ({ ...s, view: zoomed(s.view, f, around, by, RANGE) }));
	// Pointers held down, by pointerId.
	const pointers = useRef(new Map<number, [number, number]>());

	return (
		<main className="full-screen">
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
				className="pointer-events-none absolute inset-0 h-full w-full"
			>
				{/* Dims the map outside the radius: a square well past any viewport aspect, with the circle cut out. */}
				<path
					d={`M${-VIEW * 5} ${-VIEW * 5}H${VIEW * 5}V${VIEW * 5}H${-VIEW * 5}Z
						M0 ${-RANGE}A${RANGE} ${RANGE} 0 0 0 0 ${RANGE}A${RANGE} ${RANGE} 0 0 0 0 ${-RANGE}Z`}
					fillRule="evenodd"
					fillOpacity={0.5}
				/>
				{/* Clear center brightening toward the rim, like a wavefront. */}
				<radialGradient id="pulse">
					<stop offset="0" stopColor="white" stopOpacity={0} />
					<stop offset={1 / view.k} stopColor="white" stopOpacity={0.1} />
				</radialGradient>
				{/* New key per poll remounts the circle, restarting the animation. */}
				<circle
					key={poll.at}
					r={RANGE}
					fill="url(#pulse)"
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
			{/* Gestures: wheel zooms at the cursor, drag pans, two fingers pinch. Under the planes, so their links take clicks. */}
			<div
				className="absolute inset-0 touch-none select-none"
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
			<div
				className="pointer-events-none absolute inset-0"
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
			<EdgeMarkers aircraft={visible} polledAt={poll.at} settings={settings} />

			<Conf settings={settings} setSettings={setSettings} />
			{/* Narrow screens: above the map attribution, which would overlap it. */}
			<span className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-[max(0.5rem,env(safe-area-inset-left))] text-xs sm:bottom-[calc(0.5rem+env(safe-area-inset-bottom))]">
				{visible.length}/{poll.aircraft.length} aircraft · elev{" "}
				{elevation == null ? "-" : `${Math.round(elevation * elev[1])}${elev[0]}`}
				{error && <span className="ml-2 text-red-400">{error}</span>}
			</span>
		</main>
	);
}
