// .client module: Leaflet touches `document` on import, so it's kept out of the server bundle.
import "leaflet/dist/leaflet.css";
import { type LatLng, latLng } from "leaflet";
import { useLayoutEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";

type Props = {
	lat: number;
	lon: number;
	radius: number; // NM
	span: number; // fraction of the viewport's short side the radius covers
};

// Non-interactive OSM backdrop behind the radar SVG.
export function BaseMap(props: Props) {
	return (
		<MapContainer
			// isolate: keeps Leaflet's pane z-indexes (200+) inside the map, or the tiles paint over the radar
			className="absolute! inset-0 isolate bg-black!"
			zoomSnap={0}
			zoomControl={false}
			dragging={false}
			scrollWheelZoom={false}
			doubleClickZoom={false}
			touchZoom={false}
			boxZoom={false}
			keyboard={false}
		>
			<TileLayer
				url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
				// Short, so it fits one line on a phone
				attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://www.hotosm.org/">HOT</a> · <a href="https://openstreetmap.fr/">OSM France</a>'
				opacity={0.4} // dimmed so the white radar stays readable
				maxNativeZoom={18}
				maxZoom={22} // upscale past 18, or Leaflet clamps setView and the map desyncs from the radar when zoomed in
			/>
			<Fit {...props} />
		</MapContainer>
	);
}

// ponytail: Leaflet 1.9 private API, recheck on upgrade
type Internals = {
	_loaded: boolean;
	_move(center: LatLng, zoom: number): void;
	_moveEnd(zoomChanged: boolean): void;
};

// Zoom so a degree of longitude spans as many px as in the SVG's flat projection.
// Layout effect: the radar overlay moves in the same frame while zooming/panning.
function Fit({ lat, lon, radius, span }: Props) {
	const map = useMap();
	useLayoutEffect(() => {
		const fit = () => {
			const { x, y } = map.getSize();
			const pxPerDeg =
				(60 * Math.cos((lat * Math.PI) / 180) * span * Math.min(x, y)) / radius;
			// Web Mercator: 256 * 2^zoom px per 360°.
			const zoom = Math.log2((pxPerDeg * 360) / 256);
			// setView without animation resets the view, which drops every tile: the map blinked on each
			// zoom/pan frame. After the first fit, move like Leaflet's own pinch-zoom does, keeping tiles.
			const m = map as typeof map & Internals;
			if (!m._loaded) {
				map.setView([lat, lon], zoom, { animate: false });
			} else {
				const zoomChanged = map.getZoom() !== zoom;
				m._move(latLng(lat, lon), zoom);
				m._moveEnd(zoomChanged); // loads tiles for the new view (on mobile only moveend does)
			}
		};
		fit();
		map.on("resize", fit);
		return () => {
			map.off("resize", fit);
		};
	}, [map, lat, lon, radius, span]);
	return null;
}
