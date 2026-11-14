import { Hono } from "hono";

import { fetchFirmsArea } from "./firms.js";
import { fetchWildfireRisk } from "./wildfire-risk.js";
import { fetchLandslideForecast } from "./landslide-forecast.js";
import { fetchLandslideHistory } from "./landslide-history.js";
import { fetchLandslideRegionalRisk } from "./landslide-regional-risk.js";
import { cachedExternal } from "./cache.js";
import { fetchWeather, WeatherError, weatherGrid } from "./weather.js";

export const externalRoutes = new Hono();
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

externalRoutes.route("/", weatherRoutes);

externalRoutes.get("/wildfire/firms", async (c) => {
  const bbox =
    c.req.query("bbox") ??
    process.env.NASA_FIRMS_DEFAULT_BBOX?.trim() ??
    "124.0,33.0,132.0,39.5";

  const daysRaw = Number.parseInt(c.req.query("days") ?? "1", 10);
  const days = Number.isFinite(daysRaw)
    ? Math.min(Math.max(daysRaw, 1), 10)
    : 1;

  const source =
    c.req.query("source") ??
    process.env.NASA_FIRMS_SOURCE?.trim() ??
    "VIIRS_SNPP_NRT";

  const result = await cachedExternal(`firms:${bbox}:${days}:${source}`, () => fetchFirmsArea({
      mapKey: process.env.NASA_FIRMS_MAP_KEY?.trim() ?? "",
      baseUrl:
        process.env.NASA_FIRMS_BASE_URL?.trim() ??
        "https://firms.modaps.eosdis.nasa.gov",
      bbox,
      days,
      source,
    }));
  c.header("X-Forest-External-Cache", result.cache);
  return c.json(result.value);
});

externalRoutes.get("/wildfire/risk", async (c) => {
  const pageNo = Number.parseInt(c.req.query("pageNo") ?? "1", 10);
  const numOfRows = Number.parseInt(
    c.req.query("numOfRows") ?? "100",
    10,
  );

  const result = await cachedExternal(`wildfire-risk:${pageNo}:${numOfRows}`, () => fetchWildfireRisk({
      serviceKey: process.env.KFS_WILDFIRE_SERVICE_KEY?.trim() ?? "",
      baseUrl:
        process.env.KFS_WILDFIRE_BASE_URL?.trim() ??
        "http://apis.data.go.kr/1400377/forestPointV2",
      pageNo: Number.isFinite(pageNo) ? pageNo : 1,
      numOfRows: Number.isFinite(numOfRows) ? numOfRows : 100,
    }));
  c.header("X-Forest-External-Cache", result.cache);
  return c.json(result.value);
});

externalRoutes.get("/landslide/forecast", async (c) => {
  const pageNo = Number.parseInt(c.req.query("pageNo") ?? "1", 10);
  const numOfRows = Number.parseInt(
    c.req.query("numOfRows") ?? "100",
    10,
  );

  const result = await cachedExternal(`landslide-forecast:${pageNo}:${numOfRows}:${c.req.query("inqDt") ?? ""}`, () => fetchLandslideForecast({
      serviceKey:
        process.env.LANDSLIDE_FORECAST_SERVICE_KEY?.trim() ?? "",
      baseUrl:
        process.env.SAFETY_DATA_BASE_URL?.trim() ??
        "https://www.safetydata.go.kr",
      endpoint:
        process.env.LANDSLIDE_FORECAST_ENDPOINT?.trim() ??
        "/V2/api/DSSP-IF-00735",
      pageNo: Number.isFinite(pageNo) ? pageNo : 1,
      numOfRows: Number.isFinite(numOfRows) ? numOfRows : 100,
      inquiryDate: c.req.query("inqDt"),
    }));
  c.header("X-Forest-External-Cache", result.cache);
  return c.json(result.value);
});

externalRoutes.get("/landslide/history", async (c) => {
  const pageNo = Number.parseInt(c.req.query("pageNo") ?? "1", 10);
  const numOfRows = Number.parseInt(
    c.req.query("numOfRows") ?? "100",
    10,
  );

  const result = await cachedExternal(`landslide-history:${pageNo}:${numOfRows}`, () => fetchLandslideHistory({
      serviceKey:
        process.env.LANDSLIDE_HISTORY_SERVICE_KEY?.trim() ?? "",
      baseUrl:
        process.env.SAFETY_DATA_BASE_URL?.trim() ??
        "https://www.safetydata.go.kr",
      endpoint:
        process.env.LANDSLIDE_HISTORY_ENDPOINT?.trim() ??
        "/V2/api/DSSP-IF-00134",
      pageNo: Number.isFinite(pageNo) ? pageNo : 1,
      numOfRows: Number.isFinite(numOfRows) ? numOfRows : 100,
    }));
  c.header("X-Forest-External-Cache", result.cache);
  return c.json(result.value);
});

externalRoutes.get("/landslide/regional-risk", async (c) => {
  const pageNo = Number.parseInt(c.req.query("pageNo") ?? "1", 10);
  const numOfRows = Number.parseInt(
    c.req.query("numOfRows") ?? "100",
    10,
  );

  const result = await cachedExternal(`landslide-regional:${pageNo}:${numOfRows}`, () => fetchLandslideRegionalRisk({
      serviceKey:
        process.env.LANDSLIDE_REGIONAL_HISTORY_SERVICE_KEY?.trim() ??
        "",
      baseUrl:
        process.env.SAFETY_DATA_BASE_URL?.trim() ??
        "https://www.safetydata.go.kr",
      endpoint:
        process.env.LANDSLIDE_REGIONAL_RISK_ENDPOINT?.trim() ??
        "/V2/api/DSSP-IF-10076",
      pageNo: Number.isFinite(pageNo) ? pageNo : 1,
      numOfRows: Number.isFinite(numOfRows) ? numOfRows : 100,
    }));
  c.header("X-Forest-External-Cache", result.cache);
  return c.json(result.value);
});
