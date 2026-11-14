import { Hono } from "hono";
import { cachedExternal } from "./cache.js";
import { fetchWeather, WeatherError, weatherGrid } from "./weather.js";

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

