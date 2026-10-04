import assert from "node:assert/strict";
import { test } from "node:test";
import { FIELDS } from "./share.ts";
import { shown, typed, unit } from "./units.ts";

test("units", () => {
	assert.deepEqual(unit("NM", false), ["NM", 1]);
	assert.deepEqual(unit("NM", true), ["km", 1.852]);
	assert.deepEqual(unit("s", true), ["s", 1]);

	const [, f] = unit("NM", true);
	assert.equal(shown(25, f), 46.3);
	assert.equal(typed(46.3, 25, f), 25); // unchanged keeps the exact value
	assert.equal(typed(50, 25, f), 26.9978);
	assert.equal(shown(26.9978, f), 50);
	assert.equal(typed(51.4712345, 0, 1), 51.4712345); // unconverted fields aren't rounded

	// Input bounds shown in km convert back inside the share link's bounds.
	for (const [name, , min, max, u] of FIELDS) {
		const [, f] = unit(u, true);
		assert.equal(typed(shown(min, f), NaN, f), min, name);
		assert.equal(typed(shown(max, f), NaN, f), max, name);
	}
});
