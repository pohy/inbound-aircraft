import { HOME, type View } from "./view";

export type Settings = {
	lat: number;
	lon: number;
	radius: number;
	poll: number;
	overhead: number; // NM a track must pass within to count as overflying
	onlyAirborne: boolean;
	view: View;
};

export const DEFAULTS: Settings = {
	lat: 51.47,
	lon: -0.4543,
	radius: 25,
	poll: 10,
	overhead: 1,
	onlyAirborne: false,
	view: HOME,
};
