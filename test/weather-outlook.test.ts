import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { fetchForecast, fetchWarnings, kmaTime, parseForecast, parseWarnings } from "../src/external/weather-outlook.js";
import { parseWeather } from "../src/external/weather.js";
import { weatherRoutes } from "../src/external/weather-routes.js";
import { clearExternalCache } from "../src/external/cache.js";

const grid = { nx: 60, ny: 127 };
const base = { date: "20261114", time: "1330" };
const now = new Date("2026-11-14T05:20:00Z");
const payload = (item: unknown) => ({ response: { header: { resultCode: "00" }, body: { items: { item } } } });
function forecastFixture(time = "1500", values: Record<string, unknown> = { T1H: "11.2", REH: "96", WSD: "0", VEC: "270", RN1: "1.0mm 미만", PTY: "1" }) {
  return Object.entries(values).map(([category, fcstValue]) => ({ category, fcstValue, baseDate: base.date, baseTime: base.time, fcstDate: base.date, fcstTime: time, ...grid }));
}
const warningRow = { tmFc: "202611141300", tmEf: "202611141230", t6: "o 강풍주의보 : 제주도", t7: "없음" };

test("실황 강수량 0과 결측, 강수 형태를 구분한다", () => {
  const obsBase = { date: base.date, time: "1300" };
  const fixture = (rn: unknown, pty: unknown) => payload([{ category: "RN1", obsrValue: rn, baseDate: base.date, baseTime: "1300", ...grid }, { category: "PTY", obsrValue: pty, baseDate: base.date, baseTime: "1300", ...grid }, { category: "T1H", obsrValue: "12", baseDate: base.date, baseTime: "1300", ...grid }]);
  assert.equal(parseWeather(fixture("0", "0"), grid, obsBase).precipitation1hMm, 0);
  assert.equal(parseWeather(fixture("-998.9", "4"), grid, obsBase).precipitation1hMm, null);
  assert.equal(parseWeather(fixture("", "4"), grid, obsBase).precipitationType, null);
});
test("예보를 시각별 묶음으로 정렬하고 과거·범위 밖 자료와 결측값을 제외한다", () => {
  const result = parseForecast(payload([...forecastFixture("1600"), ...forecastFixture("1300"), ...forecastFixture("1500"), ...forecastFixture("2300")]), grid, base, now);
  assert.deepEqual(result.periods.map((row) => row.validAt.slice(11, 16)), ["15:00", "16:00"]);
  assert.equal(result.periods[0]?.precipitationText, "1.0mm 미만");
  assert.equal(result.periods[0]?.windSpeedMps, 0);
  assert.equal(result.issuedAt, "2026-11-14T13:30:00+09:00");
  const missing = parseForecast(payload(forecastFixture("1500", { T1H: "-999", RN1: "-998.9", WSD: "1" })), grid, base, now);
  assert.equal(missing.periods[0]?.temperatureC, null);
  assert.equal(missing.periods[0]?.precipitationText, null);
  assert.throws(() => parseForecast(payload(forecastFixture()), { nx: 1, ny: 1 }, base, now), { code: "INVALID_RESPONSE" });
});
test("예보 날짜·시각의 잘못된 날짜와 미래 발표를 만들지 않는다", () => {
  assert.throws(() => kmaTime("20260230", "1300"));
  assert.throws(() => kmaTime("20261114", "2500"));
  assert.equal(kmaTime("20261114", "0030"), "2026-11-14T00:30:00+09:00");
});
test("초단기예보는 이전 시간 30분 발표를 조회하고 NO_DATA일 때만 재시도한다", async () => {
  const bases: string[] = [];
  const result = await fetchForecast(grid, { serviceKey: "test%2Bkey", now, fetcher: async (input) => {
    const url = new URL(String(input));
    assert.equal(url.pathname.endsWith("getUltraSrtFcst"), true);
    assert.equal(url.searchParams.get("serviceKey"), "test+key");
    bases.push(url.searchParams.get("base_time")!);
    if (bases.length === 1) return Response.json({ response: { header: { resultCode: "03" } } });
    return Response.json(payload(forecastFixture().map((row) => ({ ...row, baseTime: "1230" }))));
  } });
  assert.deepEqual(bases, ["1330", "1230"]);
  assert.equal(result.periods.length, 1);
  const calls: string[] = [];
  await assert.rejects(fetchForecast(grid, { serviceKey: "test", now, fetcher: async () => { calls.push("call"); return Response.json({ response: { header: { resultCode: "30" } } }); } }), { code: "PROVIDER_REJECTED" });
  assert.equal(calls.length, 1);
});
test("자정 직후 예보 조회는 전날 날짜를 사용한다", async () => {
  await assert.rejects(fetchForecast(grid, { serviceKey: "x", now: new Date("2026-11-13T15:05:00Z"), fetcher: async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("base_date"), "20261113");
    assert.equal(url.searchParams.get("base_time"), "2330");
    return Response.json({ response: { header: { resultCode: "30" } } });
  } }), { code: "PROVIDER_REJECTED" });
});
test("전국 특보 최신 원문을 보존하고 확인 시각과 발표·현황 시각을 구분한다", () => {
  const result = parseWarnings(payload([{ ...warningRow, tmFc: "202611141200" }, warningRow]), now);
  assert.equal(result.scope, "NATIONWIDE");
  assert.equal(result.text, warningRow.t6);
  assert.equal(result.issuedAt, "2026-11-14T13:00:00+09:00");
  assert.equal(result.checkedAt, now.toISOString());
  assert.equal(parseWarnings(payload(warningRow), now).scope, "NATIONWIDE");
});
test("특보 미수신·빈 본문·이상 시각을 특보 없음으로 바꾸지 않는다", () => {
  assert.throws(() => parseWarnings({ response: { header: { resultCode: "03" } } }, now), { code: "NO_DATA" });
  assert.throws(() => parseWarnings(payload({ ...warningRow, t6: "" }), now), { code: "NO_DATA" });
  assert.throws(() => parseWarnings(payload({ ...warningRow, tmFc: "202611151300" }), now));
  assert.throws(() => parseWarnings(payload({ ...warningRow, tmFc: "202611011300" }), now));
});
test("예보·특보 오류에 인증키나 URL을 노출하지 않는다", async () => {
  for (const action of [() => fetchForecast(grid, { serviceKey: "sensitive", now, fetcher: async () => { throw new Error("URL sensitive"); } }), () => fetchWarnings({ serviceKey: "sensitive", now, fetcher: async () => { throw new Error("URL sensitive"); } })]) {
    await assert.rejects(action(), (error: unknown) => error instanceof Error && !error.message.includes("sensitive"));
  }
  await assert.rejects(fetchWarnings({ serviceKey: "", fetcher: async () => { throw new Error("must not call"); } }), { code: "NOT_CONFIGURED" });
});
test("예보·특보 HTTP 경로는 좌표·키 누락을 구분하고 서로 독립적이다", async () => {
  const weatherKey = process.env.KMA_WEATHER_SERVICE_KEY;
  const warningKey = process.env.KMA_WARNING_SERVICE_KEY;
  try {
    delete process.env.KMA_WEATHER_SERVICE_KEY; delete process.env.KMA_WARNING_SERVICE_KEY; clearExternalCache();
    const app = new Hono().route("/external", weatherRoutes);
    assert.equal((await app.request("/external/weather/forecast?latitude=0&longitude=0")).status, 400);
    assert.equal((await app.request("/external/weather/forecast?latitude=37&longitude=127")).status, 503);
    assert.equal((await app.request("/external/weather/warnings")).status, 503);
  } finally {
    if (weatherKey !== undefined) process.env.KMA_WEATHER_SERVICE_KEY = weatherKey;
    if (warningKey !== undefined) process.env.KMA_WARNING_SERVICE_KEY = warningKey;
    clearExternalCache();
  }
});

test("실제 HTTP 경로는 실황·예보·특보를 각각 정규화하고 반복 조회는 캐시를 사용한다", async () => {
  const originalFetch = globalThis.fetch;
  const originalWeatherKey = process.env.KMA_WEATHER_SERVICE_KEY;
  const originalWarningKey = process.env.KMA_WARNING_SERVICE_KEY;
  const calls: string[] = [];
  const kstDigits = (date: Date) => new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace(/[-T:]/g, "");
  try {
    clearExternalCache(); process.env.KMA_WEATHER_SERVICE_KEY = "route-test"; process.env.KMA_WARNING_SERVICE_KEY = "route-warning-test";
    globalThis.fetch = async (input) => {
      const url = new URL(String(input)); calls.push(url.pathname);
      if (url.pathname.endsWith("getPwnStatus")) {
        assert.equal(url.searchParams.get("serviceKey"), "route-warning-test");
        const stamp = kstDigits(new Date(Date.now() - 3600_000));
        return Response.json(payload({ ...warningRow, tmFc: stamp, tmEf: stamp }));
      }
      const row = { baseDate: url.searchParams.get("base_date"), baseTime: url.searchParams.get("base_time"), nx: url.searchParams.get("nx"), ny: url.searchParams.get("ny") };
      if (url.pathname.endsWith("getUltraSrtFcst")) {
        const future = kstDigits(new Date(Date.now() + 2 * 3600_000));
        return Response.json(payload([{ ...row, category: "WSD", fcstValue: "1", fcstDate: future.slice(0, 8), fcstTime: future.slice(8, 10) + "00" }]));
      }
      return Response.json(payload([{ ...row, category: "RN1", obsrValue: "0" }]));
    };
    const app = new Hono().route("/external", weatherRoutes);
    const paths = ["/external/weather?latitude=37&longitude=127", "/external/weather/forecast?latitude=37&longitude=127", "/external/weather/warnings"];
    for (const path of paths) assert.equal((await app.request(path)).status, 200);
    for (const path of paths) {
      const response = await app.request(path);
      const body = await response.json();
      assert.equal(body.meta.cache, "HIT");
      assert.equal(body.meta.stale, false);
    }
    assert.equal(calls.length, 3);
    clearExternalCache();
    globalThis.fetch = async () => Response.json({ response: { header: { resultCode: "03" } } });
    const warningFailure = await app.request("/external/weather/warnings");
    assert.equal(warningFailure.status, 502);
    assert.equal((await warningFailure.json()).error.code, "NO_DATA");
  } finally {
    globalThis.fetch = originalFetch; clearExternalCache();
    if (originalWeatherKey === undefined) delete process.env.KMA_WEATHER_SERVICE_KEY; else process.env.KMA_WEATHER_SERVICE_KEY = originalWeatherKey;
    if (originalWarningKey === undefined) delete process.env.KMA_WARNING_SERVICE_KEY; else process.env.KMA_WARNING_SERVICE_KEY = originalWarningKey;
  }
});
