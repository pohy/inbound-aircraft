import assert from "node:assert/strict";
import { test } from "node:test";
import { overheadIn } from "./overhead.ts";

test("overheadIn", () => {
	// 10 NM south, northbound at 600 kt: overhead in 60 s, out of the 1 NM circle 6 s later.
	assert.deepEqual(overheadIn(0, -10, 0, 600, 1), { closest: 60, exit: 66 });
	// 10 NM NE, southwestbound.
	assert.ok(Math.abs(overheadIn(7.0711, 7.0711, 225, 600, 1)!.closest - 60) < 0.01);
	// Eastbound, offset 0.5 NM north: within tolerance, shorter chord. 2 NM: misses.
	const off = overheadIn(-10, 0.5, 90, 600, 1)!;
	assert.ok(Math.abs(off.exit - off.closest - Math.sqrt(0.75) * 6) < 1e-9);
	assert.equal(overheadIn(-10, 2, 90, 600, 1), undefined);
	// Southbound from south of center: overflown 60 s ago, left the circle 54 s ago.
	assert.deepEqual(overheadIn(0, -10, 180, 600, 1), { closest: -60, exit: -54 });
	// Stationary.
	assert.equal(overheadIn(0, -10, 0, 0, 1), undefined);
});
