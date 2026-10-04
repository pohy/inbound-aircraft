import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { loader } from "./routes/api.aircraft.ts";

test("adsb.lol responses are held 10s and aged, failures are not", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let calls = 0;
  let fail = false;
  globalThis.fetch = (async () => {
    calls++;
    return fail ? new Response("", { status: 429 }) : Response.json({ ac: [{ hex: "a", lat: 1, lon: 2, seen_pos: 2 }] });
  }) as typeof fetch;
  const req = () => loader({ request: new Request("http://x/api/aircraft?lat=1&lon=2&radius=10") } as any);

  const [a, b] = await Promise.all([req(), req()]);
  assert.equal(calls, 1); // concurrent requests share one upstream fetch
  assert.deepEqual(a, b);
  mock.timers.tick(5_000);
  assert.equal(((await req()) as any).aircraft[0].seenPos, 7); // fix aged by its 5s in the cache
  mock.timers.tick(4_999);
  await req();
  assert.equal(calls, 1);
  mock.timers.tick(1);
  await req();
  assert.equal(calls, 2);

  mock.timers.tick(10_000);
  fail = true;
  assert.equal(((await req()) as any).data.error, "adsb.lol: HTTP 429");
  await req();
  assert.equal(calls, 4);
});
