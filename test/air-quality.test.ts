import assert from "node:assert/strict";
import test from "node:test";
import { clearExternalCache } from "../src/external/cache.js";
import { fetchAirQuality, nearestStation, parseAirItems, parseAirQuality, parseStations } from "../src/external/air-quality.js";
import { weatherApp } from "../src/external/weather-app.js";
import { fetchWildfireRisk } from "../src/external/wildfire-risk.js";

const stations = [{ stationName: "먼측정소", addr: "서울", dmX: "37.5", dmY: "127" }, { stationName: "가까운측정소", addr: "대전", dmX: "36.37", dmY: "127.33" }, { stationName: "좌표없음", dmX: "", dmY: "" }];
const envelope = (items: unknown[], totalCount = items.length) => ({ response: { header: { resultCode: "00" }, body: { items, totalCount } } });
const selected = nearestStation(parseStations(stations), 36.37, 127.33);
test("공식 dmX=위도·dmY=경도를 사용하고 좌표 결측 측정소를 제외한다", () => {
  assert.equal(parseStations(stations).length, 2);
  assert.equal(selected.station.name, "가까운측정소");
  assert.equal(selected.distanceKm, 0);
  assert.throws(() => nearestStation([], 36, 127), { code: "NO_DATA" });
});
test("PM 실제 0·결측·장비 점검 플래그와 관측 시각을 구분한다", () => {
  const value = parseAirQuality([{ stationName: "가까운측정소", dataTime: "2026-11-14 14:00", pm10Value: "0", pm25Value: "-" }], selected);
  assert.equal(value.pm10, 0); assert.equal(value.pm25, null);
  assert.equal(value.observedAt, "2026-11-14T14:00:00+09:00");
  assert.equal(parseAirQuality([{ dataTime: "2026-11-14 14:00", pm10Value: "100", pm10Flag: "장비점검" }], selected).pm10, null);
  assert.throws(() => parseAirQuality([{ dataTime: "2026-02-30 14:00", pm10Value: "0" }], selected));
  assert.throws(() => parseAirQuality([{ stationName: "다른측정소", dataTime: "2026-11-14 14:00" }], selected));
});
test("API 권한 오류·빈 형식을 정상 대기질로 바꾸지 않는다", () => {
  assert.throws(() => parseAirItems({ response: { header: { resultCode: "30" } } }), { code: "PROVIDER_REJECTED" });
  assert.throws(() => parseAirItems({ response: { header: { resultCode: "00" }, body: { items: {} } } }), { code: "INVALID_RESPONSE" });
});
test("전체 측정소 페이지를 읽고 인근 측정소를 조회하며 좌표별 거리와 캐시를 구분한다", async () => {
  clearExternalCache(); const calls: URL[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input)); calls.push(url);
    assert.equal(url.searchParams.get("serviceKey"), "test+key");
    if (url.pathname.endsWith("getMsrstnList")) return Response.json(url.searchParams.get("pageNo") === "1" ? envelope([stations[0]!], 2) : envelope([stations[1]!], 2));
    assert.equal(url.searchParams.get("stationName"), "가까운측정소");
    return Response.json(envelope([{ dataTime: "2026-11-14 14:00", pm10Value: "0", pm25Value: "5" }]));
  };
  const first = await fetchAirQuality(36.37, 127.33, { serviceKey: "test%2Bkey", fetcher });
  const second = await fetchAirQuality(36.38, 127.33, { serviceKey: "test%2Bkey", fetcher });
  assert.equal(first.data.distanceKm, 0); assert.ok(second.data.distanceKm > 1);
  assert.equal(calls.length, 3); assert.equal(second.data.pm10, 0);
  clearExternalCache();
});
test("빈 키는 호출하지 않으며 오류에 키·URL을 노출하지 않는다", async () => {
  await assert.rejects(fetchAirQuality(36, 127, { serviceKey: "", fetcher: async () => { throw new Error("must not call"); } }), { code: "NOT_CONFIGURED" });
  await assert.rejects(fetchAirQuality(36, 127, { serviceKey: "sensitive", fetcher: async () => { throw new Error("URL sensitive"); } }), (error: unknown) => error instanceof Error && !error.message.includes("sensitive"));
});
test("로컬 대기질·산불위험 경로는 DB 없이 키 누락을 안내한다", async () => {
  const air = process.env.AIRKOREA_SERVICE_KEY, forest = process.env.KFS_WILDFIRE_SERVICE_KEY;
  try {
    delete process.env.AIRKOREA_SERVICE_KEY; delete process.env.KFS_WILDFIRE_SERVICE_KEY;
    assert.equal((await weatherApp.request("/api/v1/external/environment/air-quality?latitude=36&longitude=127")).status, 503);
    assert.equal((await weatherApp.request("/api/v1/external/environment/air-quality?latitude=0&longitude=0")).status, 400);
    assert.equal((await weatherApp.request("/api/v1/external/environment/wildfire-risk")).status, 503);
  } finally {
    if (air !== undefined) process.env.AIRKOREA_SERVICE_KEY = air;
    if (forest !== undefined) process.env.KFS_WILDFIRE_SERVICE_KEY = forest;
  }
});
test("산불위험 원자료의 빈 수치를 0으로 만들지 않는다", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("<response><resultCode>00</resultCode><items><item><analdate>2026111414</analdate><doname>충남</doname><sigun>예산</sigun><meanavg></meanavg><mini>0</mini><maxi>-999</maxi></item></items><totalCount>1</totalCount></response>");
    const value = await fetchWildfireRisk({ serviceKey: "test", baseUrl: "https://apis.data.go.kr/1400377/forestPointV2" });
    assert.equal(value.data[0]?.mean, null); assert.equal(value.data[0]?.min, 0); assert.equal(value.data[0]?.max, null);
  } finally { globalThis.fetch = original; }
});


test("상위 401을 측정소정보와 대기오염정보 단계로 구분하고 키를 노출하지 않는다", async () => {
  clearExternalCache();
  await assert.rejects(fetchAirQuality(36.37, 127.33, { serviceKey: "stage-secret-a", fetcher: async () => new Response("unauthorized", { status: 401 }) }), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal((error as Error & { code: string }).code, "AIR_STATION_AUTH_FAILED");
    assert.ok(error.message.includes("측정소정보 HTTP 401"));
    assert.ok(!error.message.includes("stage-secret-a")); return true;
  });
  clearExternalCache();
  await assert.rejects(fetchAirQuality(36.37, 127.33, { serviceKey: "stage-secret-b", fetcher: async (input) => {
    if (new URL(String(input)).pathname.endsWith("getMsrstnList")) return Response.json(envelope(stations));
    return new Response("unauthorized", { status: 401 });
  } }), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal((error as Error & { code: string }).code, "AIR_OBSERVATION_AUTH_FAILED");
    assert.ok(error.message.includes("대기오염정보 HTTP 401"));
    assert.ok(!error.message.includes("stage-secret-b")); return true;
  });
  clearExternalCache();
});
