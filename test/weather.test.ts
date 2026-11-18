import assert from "node:assert/strict";
import test from "node:test";
import { fetchCurrentWeather, weatherCoordinates } from "../src/external/weather.js";
import { cachedExternal, clearExternalCache } from "../src/external/cache.js";

test("산불 구역 Point와 Polygon의 중심을 사용하고 없는 위치는 거절한다", () => {
  assert.deepEqual(weatherCoordinates({ type: "Point", coordinates: [126.6, 36.7] }), [126.6, 36.7]);
  assert.deepEqual(weatherCoordinates({ type: "Polygon", coordinates: [[[126, 36], [128, 38], [126, 36]]] }), [127, 37]);
  assert.equal(weatherCoordinates(null), null);
  assert.equal(weatherCoordinates({ type: "Point", coordinates: [999, 36] }), null);
});

test("원본 시각과 interval로 갱신을 예약하며 누락값을 0으로 만들지 않는다", async () => {
  const original = globalThis.fetch;
  const now = Date.parse("2026-11-18T00:03:00Z");
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("latitude"), "36.7");
    assert.equal(url.searchParams.get("longitude"), "126.6");
    assert.equal(url.searchParams.get("wind_speed_unit"), "ms");
    return Response.json({ current: { time: Date.parse("2026-11-18T00:00:00Z") / 1000, interval: 900, temperature_2m: 0 } });
  };
  try {
    const result = await fetchCurrentWeather("event", "산불 구역", [126.6, 36.7], now);
    assert.equal(result.nextRefreshAt, "2026-11-18T00:15:30.000Z");
    assert.equal(result.observation.temperatureC, 0);
    assert.equal(result.observation.humidityPct, null);
    clearExternalCache();
    let calls = 0;
    const loader = async () => { calls++; return result; };
    const options = { now: () => now, expiresAt: (value: typeof result) => Date.parse(value.nextRefreshAt) };
    await cachedExternal("weather-test", loader, options);
    await cachedExternal("weather-test", loader, { ...options, now: () => now + 600_000 });
    assert.equal(calls, 1);
    await cachedExternal("weather-test", loader, { ...options, now: () => now + 900_000 });
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});
