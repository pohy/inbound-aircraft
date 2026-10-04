// Seconds until a plane holding its track passes within `tolerance` NM of the center (negative: since it did),
// or undefined if it misses. east/north: NM from center; track: ° true; gs: kt.
// ponytail: straight line only, turning traffic (approach patterns) gets re-predicted each poll
export function overheadIn(
	east: number,
	north: number,
	track: number,
	gs: number,
	tolerance: number,
) {
	const rad = (track * Math.PI) / 180;
	const ux = Math.sin(rad);
	const uy = Math.cos(rad);
	const along = -(east * ux + north * uy); // NM to closest approach, negative once passed
	const miss = Math.abs(east * uy - north * ux); // NM off center at closest approach
	return gs > 0 && miss <= tolerance ? (along / gs) * 3600 : undefined;
}
