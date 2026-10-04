// .client module: Leaflet touches `document` on import, so it's kept out of the server bundle.
import "leaflet/dist/leaflet.css";
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
			className="fixed! inset-0 bg-black!"
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
				attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/">Humanitarian OpenStreetMap Team</a> hosted by <a href="https://openstreetmap.fr/">OpenStreetMap France</a>'
				opacity={0.4} // dimmed so the white radar stays readable
				maxNativeZoom={18}
				maxZoom={22} // upscale past 18, or Leaflet clamps setView and the map desyncs from the radar when zoomed in
			/>
			<Fit {...props} />
		</MapContainer>
	);
}

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
			map.setView([lat, lon], Math.log2((pxPerDeg * 360) / 256), {
				animate: false,
			});
		};
		fit();
		map.on("resize", fit);
		return () => {
			map.off("resize", fit);
		};
	}, [map, lat, lon, radius, span]);
	return null;
}
