import { Hono } from "hono";
import { cachedExternal } from "./cache.js";
import { fetchWeather, WeatherError, weatherGrid } from "./weather.js";

import { fetchForecast, fetchWarnings } from "./weather-outlook.js";

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
