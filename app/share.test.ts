import assert from "node:assert/strict";
import { test } from "node:test";
import { takeShared, toQuery } from "./share.ts";

const s = {
	lat: 51.47,
	lon: -0.4543,
	radius: 25,
	poll: 10,
	overhead: 0.5,
	onlyAirborne: true,
};

test("takeShared", () => {
	// Round trips, stripping only its own params.
	const url = new URL(`http://x/?keep=1&${toQuery(s)}`);
	assert.deepEqual(takeShared(url), s);
	assert.equal(url.search, "?keep=1");

	// Incomplete or out of bounds is ignored, but still stripped.
	const q = String(toQuery(s));
	for (const bad of [
		q.replace("radius=25&", ""),
		q.replace("lat=51.47", "lat=91"),
		q.replace("lat=51.47", "lat="),
		q.replace("lat=51.47", "lat=abc"),
		q.replace("onlyAirborne=true", "onlyAirborne=1"),
	]) {
		const url = new URL(`http://x/?${bad}`);
		assert.equal(takeShared(url), undefined, bad);
		assert.equal(url.search, "");
	}
});
