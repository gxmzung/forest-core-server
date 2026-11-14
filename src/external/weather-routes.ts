import { Hono } from "hono";
import { cachedExternal } from "./cache.js";
import { fetchWeather, WeatherError, weatherGrid } from "./weather.js";

import { fetchForecast, fetchWarnings } from "./weather-outlook.js";

import { fetchAirQuality } from "./air-quality.js";
import { fetchWildfireRisk } from "./wildfire-risk.js";

export const weatherRoutes = new Hono();

weatherRoutes.get("/weather", async (c) => {
  try {
    const lat = c.req.query("latitude"), lon = c.req.query("longitude");
    if (!lat?.trim() || !lon?.trim()) throw new WeatherError("INVALID_LOCATION", "위도·경도가 필요합니다.", 400);
    const grid = weatherGrid(Number(lat), Number(lon));
    // 인증키가 제거된 경우 기존 캐시도 정상 연결로 반환하지 않는다.
    const serviceKey = process.env.KMA_WEATHER_SERVICE_KEY?.trim() ?? "";
    if (!serviceKey) throw new WeatherError("NOT_CONFIGURED", "기상청 API 인증키가 서버에 설정되지 않았습니다.", 503);
    const result = await cachedExternal(`weather:${grid.nx}:${grid.ny}`, () => fetchWeather(grid, { serviceKey }), { ttlMs: 300_000, staleIfErrorMs: 1800_000 });
    return c.json({ data: result.value, meta: { provider: "기상청 초단기실황", source: "KMA_OBSERVATION", cache: result.cache, servedAt: new Date().toISOString(), stale: result.cache === "STALE", note: "인근 5km 격자의 대표 관측값이며 풍선 탑재 센서 실측값이 아닙니다." } });
  } catch (error) {
    const failure = error instanceof WeatherError ? error : new WeatherError("WEATHER_UNAVAILABLE", "기상정보를 불러오지 못했습니다.");
    return c.json({ error: { code: failure.code, message: failure.message } }, failure.status);
  }
});


// 독립 경로로 조회하여 예보·특보 장애가 실황 표시를 중단하지 않도록 한다.
weatherRoutes.get("/weather/forecast", async (c) => {
  try {
    const lat = c.req.query("latitude"), lon = c.req.query("longitude");
    if (!lat?.trim() || !lon?.trim()) throw new WeatherError("INVALID_LOCATION", "위도·경도가 필요합니다.", 400);
    const grid = weatherGrid(Number(lat), Number(lon));
    const serviceKey = process.env.KMA_WEATHER_SERVICE_KEY?.trim() ?? "";
    if (!serviceKey) throw new WeatherError("NOT_CONFIGURED", "기상청 인증키 서버 설정이 필요합니다.", 503);
    const result = await cachedExternal(`weather-forecast:${grid.nx}:${grid.ny}`, () => fetchForecast(grid, { serviceKey }), { ttlMs: 300_000, staleIfErrorMs: 900_000 });
    return c.json({ data: result.value, meta: { source: "KMA_FORECAST", provider: "기상청 초단기예보", stale: result.cache === "STALE", cache: result.cache, servedAt: new Date().toISOString() } });
  } catch (error) {
    const failure = error instanceof WeatherError ? error : new WeatherError("WEATHER_UNAVAILABLE", "예보를 불러오지 못했습니다.");
    return c.json({ error: { code: failure.code, message: failure.message } }, failure.status);
  }
});

weatherRoutes.get("/weather/warnings", async (c) => {
  try {
    const serviceKey = process.env.KMA_WARNING_SERVICE_KEY?.trim() || process.env.KMA_WEATHER_SERVICE_KEY?.trim() || "";
    if (!serviceKey) throw new WeatherError("NOT_CONFIGURED", "기상특보 인증키 서버 설정이 필요합니다.", 503);
    const result = await cachedExternal("weather-warnings:nationwide", () => fetchWarnings({ serviceKey }), { ttlMs: 300_000, staleIfErrorMs: 0 });
    return c.json({ data: result.value, meta: { source: "KMA_WARNING", provider: "기상청 특보현황", stale: false, cache: result.cache, servedAt: new Date().toISOString(), note: "전국 현황 원문입니다. 현장 좌표별 특보 판정이 아니며 전광판 현장 경보로 자동 전송하지 않습니다." } });
  } catch (error) {
    const failure = error instanceof WeatherError ? error : new WeatherError("WEATHER_UNAVAILABLE", "기상특보를 불러오지 못했습니다.");
    return c.json({ error: { code: failure.code, message: failure.message } }, failure.status);
  }
});


// DB 없이 실행되는 로컬 공공데이터 경로. 기존 운영 연계 경로는 유지한다.
weatherRoutes.get("/environment/air-quality", async (c) => {
  try {
    const latitude = Number(c.req.query("latitude") ?? NaN), longitude = Number(c.req.query("longitude") ?? NaN);
    weatherGrid(latitude, longitude);
    const key = process.env.AIRKOREA_SERVICE_KEY?.trim() || "";
    const result = await fetchAirQuality(latitude, longitude, { serviceKey: key });
    return c.json({ data: result.data, meta: { source: "AIRKOREA", stale: result.stale, servedAt: new Date().toISOString(), note: "좌표 확인된 인근 측정소 관측값입니다. 현장 연기·유해가스 직접 측정값이 아닙니다." } });
  } catch (error) {
    const failure = error instanceof WeatherError ? error : new WeatherError("PROVIDER_UNAVAILABLE", "대기질 자료를 받지 못했습니다.");
    return c.json({ error: { code: failure.code, message: failure.message } }, failure.status);
  }
});
weatherRoutes.get("/environment/wildfire-risk", async (c) => {
  try {
    const key = process.env.KFS_WILDFIRE_SERVICE_KEY?.trim() || "";
    if (!key) throw new WeatherError("NOT_CONFIGURED", "산림청 산불위험예보 인증키 서버 설정이 필요합니다.", 503);
    const pageNo = Number(c.req.query("pageNo") ?? 1);
    if (!Number.isInteger(pageNo) || pageNo < 1 || pageNo > 100) throw new WeatherError("INVALID_PAGE", "페이지 범위를 확인하세요.", 400);
    const result = await cachedExternal(`environment-wildfire:${pageNo}`, () => fetchWildfireRisk({ serviceKey: key, baseUrl: "https://apis.data.go.kr/1400377/forestPointV2", pageNo, numOfRows: 300, excludeForecast: true }), { ttlMs: 300_000, staleIfErrorMs: 900_000 });
    return c.json({ data: result.value.data, meta: { ...result.value.meta, source: "KFS_WILDFIRE", stale: result.cache === "STALE", servedAt: new Date().toISOString() } });
  } catch (error) {
    const failure = error instanceof WeatherError ? error : new WeatherError("PROVIDER_UNAVAILABLE", "산림청 산불위험예보 수신 실패 · 활용신청·인증키·연결을 확인하세요.");
    return c.json({ error: { code: failure.code, message: failure.message } }, failure.status);
  }
});
