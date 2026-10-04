import assert from "node:assert/strict";
import { test } from "node:test";
import { HOME, toEdge, zoomed } from "./view.ts";

test("zoomed", () => {
	// The point under the cursor stays put: screen = (p - center) * k.
	const v = zoomed(HOME, 2, [100, 50], [0, 0], 450);
	assert.deepEqual(v, { k: 2, x: 50, y: 25 });
	// Content follows a drag.
	assert.deepEqual(zoomed(v, 1, [0, 0], [20, 0], 450), { k: 2, x: 40, y: 25 });
	// Capped zoom.
	assert.equal(zoomed(HOME, 100, [0, 0], [0, 0], 450).k, 16);
	// At k = 2 the center can't leave half the radius.
	assert.deepEqual(zoomed({ k: 2, x: 0, y: 0 }, 1, [0, 0], [-1000, 0], 450), {
		k: 2,
		x: 225,
		y: 0,
	});
	// Zooming fully out resets, wherever the cursor is.
	assert.deepEqual(zoomed(v, 0.1, [-300, -300], [0, 0], 450), HOME);
});

test("toEdge", () => {
	// On screen: no marker.
	assert.equal(toEdge(100, -50, 400, 300, 10), undefined);
	// Straight right / up: pinned to that edge, inset.
	assert.deepEqual(toEdge(1000, 0, 400, 300, 10), [390, 0]);
	assert.deepEqual(toEdge(0, -1000, 400, 300, 10), [0, -290]);
	// Diagonal on a wide screen hits the top/bottom edge first, keeping the direction.
	assert.deepEqual(toEdge(1000, 1000, 400, 300, 10), [290, 290]);
});
