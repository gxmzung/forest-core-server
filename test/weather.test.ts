import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { externalRoutes } from "../src/external/routes.js";
import { fetchWeather, observationBase, parseWeather, weatherGrid } from "../src/external/weather.js";

const grid = { nx: 60, ny: 127 };
const base = { date: "20261114", time: "1300" };
function fixture(values: Record<string, unknown> = { T1H: "12.5", REH: "0", WSD: "0", VEC: "-99" }) {
  return { response: { header: { resultCode: "00" }, body: { items: { item: Object.entries(values).map(([category, obsrValue]) => ({ category, obsrValue, baseDate: base.date, baseTime: base.time, ...grid })) } } } };
}

test("공식 기준점과 서울 위치를 5km 격자로 변환한다", () => {
  assert.deepEqual(weatherGrid(38, 126), { nx: 43, ny: 136 });
  assert.deepEqual(weatherGrid(37.5665, 126.978), grid);
  assert.throws(() => weatherGrid(NaN, 127));
  assert.throws(() => weatherGrid(0, 0));
});
test("KST 날짜 경계를 넘어 지난 정시를 조회한다", () => {
  assert.deepEqual(observationBase(new Date("2026-11-13T15:20:00Z")), { date: "20261113", time: "2300" });
});
test("실제 0과 결측을 구분하고 요청 시각·격자를 확인한다", () => {
  const value = parseWeather(fixture(), grid, base);
  assert.equal(value.temperatureC, 12.5);
  assert.equal(value.humidityPct, 0);
  assert.equal(value.windSpeedMps, 0);
  assert.equal(value.windDirectionDeg, null);
  assert.equal(value.observedAt, "2026-11-14T13:00:00+09:00");
  assert.throws(() => parseWeather(fixture(), { nx: 1, ny: 1 }, base));
  assert.throws(() => parseWeather(fixture({ T1H: "", WSD: "-999" }), grid, base));
});
test("키 누락 시 네트워크 호출 없이 실패한다", async () => {
  await assert.rejects(fetchWeather(grid, { serviceKey: "", fetcher: async () => { throw new Error("호출 금지"); } }), { code: "NOT_CONFIGURED" });
});
test("자료 미발표일 때만 이전 시각을 재조회하고 키를 올바르게 인코딩한다", async () => {
  const times: string[] = [];
  const result = await fetchWeather(grid, { serviceKey: "test%2Bkey", now: new Date("2026-11-14T06:10:00Z"), fetcher: async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("serviceKey"), "test+key");
    times.push(url.searchParams.get("base_time")!);
    return Response.json(times.length === 1 ? { response: { header: { resultCode: "03" } } } : fixture());
  } });
  assert.deepEqual(times, ["1400", "1300"]);
  assert.equal(result.temperatureC, 12.5);
});
test("요청 실패 원문에 포함된 키·URL은 전달하지 않는다", async () => {
  await assert.rejects(fetchWeather(grid, { serviceKey: "sensitive", fetcher: async () => { throw new Error("https://example.test/?key=sensitive"); } }), (error: unknown) => error instanceof Error && !error.message.includes("sensitive"));
});
test("날씨 경로는 잘못된 좌표를 400으로 거절한다", async () => {
  const app = new Hono().route("/external", externalRoutes);
  assert.equal((await app.request("/external/weather?latitude=&longitude=127")).status, 400);
  assert.equal((await app.request("/external/weather?latitude=0&longitude=0")).status, 400);
});
