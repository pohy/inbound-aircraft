import assert from "node:assert/strict";
import { test } from "node:test";
import { overheadIn } from "./overhead.ts";

test("overheadIn", () => {
	// 10 NM south, northbound at 600 kt: overhead in 60 s.
	assert.equal(overheadIn(0, -10, 0, 600, 1), 60);
	// 10 NM NE, southwestbound.
	assert.ok(Math.abs(overheadIn(7.0711, 7.0711, 225, 600, 1)! - 60) < 0.01);
	// Eastbound, offset 0.5 NM north: within tolerance. 2 NM: misses.
	assert.ok(overheadIn(-10, 0.5, 90, 600, 1)! > 0);
	assert.equal(overheadIn(-10, 2, 90, 600, 1), undefined);
	// Southbound from south of center: overflown 60 s ago.
	assert.equal(overheadIn(0, -10, 180, 600, 1), -60);
	// Stationary.
	assert.equal(overheadIn(0, -10, 0, 0, 1), undefined);
});
