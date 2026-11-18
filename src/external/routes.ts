import { Hono } from "hono";
import { fetchCurrentWeather, weatherCoordinates } from "./weather.js";

import { fetchFirmsArea } from "./firms.js";
import { fetchWildfireRisk } from "./wildfire-risk.js";
import { fetchLandslideForecast } from "./landslide-forecast.js";
import { fetchLandslideHistory } from "./landslide-history.js";
import { fetchLandslideRegionalRisk } from "./landslide-regional-risk.js";
import { cachedExternal } from "./cache.js";
import { readExternalIntegrationStatus } from "./status.js";

export const externalRoutes = new Hono();

externalRoutes.get("/weather/current", async (c) => {
  const { localDb } = await import("../local-demo/db.js");
  const eventId = c.req.query("eventId") ?? "";
  const event = localDb().prepare("SELECT event_name, metadata_json FROM disaster_event WHERE event_id = ?").get(eventId);
  if (!event) return c.json({ error: { message: "재난 구역을 찾을 수 없습니다." } }, 404);
  const metadata = JSON.parse(String(event.metadata_json)) as Record<string, unknown>;
  const coordinates = weatherCoordinates(metadata.geometry);
  if (!coordinates) return c.json({ error: { message: "산불 구역의 위치를 먼저 설정해 주세요." } }, 400);
  const areaName = String(metadata.location_name ?? event.event_name);
  try {
    const result = await cachedExternal(`weather:${eventId}:${coordinates.join(",")}:${areaName}`, () => fetchCurrentWeather(eventId, areaName, coordinates), { expiresAt: value => Date.parse(value.nextRefreshAt) });
    c.header("Cache-Control", "no-store");
    return c.json({ data: { ...result.value, stale: result.cache === "STALE" } });
  } catch {
    return c.json({ error: { message: "날씨를 가져오지 못했습니다. 잠시 후 다시 확인합니다." } }, 502);
  }
});

externalRoutes.get("/status", async (c) => {
  return c.json(
    await readExternalIntegrationStatus(),
  );
});

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
