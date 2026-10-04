import { data } from "react-router";
import type { Route } from "./+types/api.aircraft";

export type Aircraft = {
  hex: string;
  flight?: string;
  type?: string; // ICAO type designator, e.g. A320
  lat: number;
  lon: number;
  gs?: number; // knots
  track?: number; // degrees true
  alt?: number | "ground"; // feet
  seenPos?: number; // seconds since the position was received
};

type AdsbLolAircraft = Omit<Aircraft, "type" | "lat" | "lon" | "alt" | "seenPos"> & {
  t?: string;
  lat?: number;
  lon?: number;
  calc_track?: number;
  alt_baro?: number | "ground";
  seen_pos?: number;
};

// ponytail: server-side proxy because api.adsb.lol sends no CORS headers
export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  const radius = Number(params.get("radius"));
  // Numbers only past this point, so nothing user-controlled reaches the upstream path.
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && radius > 0 && radius <= 250)) {
    return data({ error: "Invalid lat/lon/radius" }, { status: 400 });
  }

  // Errors are returned, not thrown: a thrown fetcher error would replace the page with the ErrorBoundary.
  try {
    const res = await fetch(`https://api.adsb.lol/v2/point/${lat}/${lon}/${radius}`, {
      signal: request.signal,
      headers: { "User-Agent": "inbound-aircraft" }, // adsb.lol 403s Node's default "node" UA
    });
    if (!res.ok) return data({ error: `adsb.lol: HTTP ${res.status}` }, { status: 502 });
    const { ac } = (await res.json()) as { ac: AdsbLolAircraft[] };
    return {
      aircraft: ac.flatMap((a): Aircraft[] =>
        a.lat == null || a.lon == null
          ? []
          : [
              {
                hex: a.hex,
                flight: a.flight?.trim(),
                type: a.t,
                lat: a.lat,
                lon: a.lon,
                gs: a.gs,
                track: a.track ?? a.calc_track,
                alt: a.alt_baro,
                seenPos: a.seen_pos,
              },
            ],
      ),
    };
  } catch (e) {
    return data({ error: `adsb.lol: ${e}` }, { status: 502 });
  }
}
