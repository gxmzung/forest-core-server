import { fetchWeatherProvider } from "./weather-provider.js";

export function weatherCoordinates(geometry: unknown): [number, number] | null {
  if (!geometry || typeof geometry !== "object") return null;
  const shape = geometry as { type?: string; coordinates?: unknown };
  if (!["Point", "Polygon", "MultiPolygon"].includes(shape.type ?? "")) return null;
  const points: number[][] = [];
  function visit(value: unknown): void {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      if (Number.isFinite(value[0]) && Number.isFinite(value[1]) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90) points.push([value[0], value[1]]);
    } else value.forEach(visit);
  }
  visit(shape.coordinates);
  if (!points.length) return null;
  const lon = points.map(p => p[0]!);
  const lat = points.map(p => p[1]!);
  return [(Math.min(...lon) + Math.max(...lon)) / 2, (Math.min(...lat) + Math.max(...lat)) / 2];
}

export async function fetchCurrentWeather(eventId: string, areaName: string, coordinates: [number, number], now = Date.now()) {
  const [longitude, latitude] = coordinates;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), current: "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,surface_pressure", wind_speed_unit: "ms", timeformat: "unixtime", timezone: "Asia/Seoul" }).toString();
  const body = await fetchWeatherProvider(url) as { current?: Record<string, unknown> };
  const current = body.current;
  if (!current || typeof current.time !== "number" || !Number.isFinite(current.time) || typeof current.interval !== "number" || !Number.isFinite(current.interval) || current.interval < 60 || current.interval > 86400) throw new Error("Invalid weather source time");
  const intervalSeconds = current.interval;
  const observedAt = new Date(current.time * 1000).toISOString();
  const nextRefreshAt = new Date(Math.max(now + 60_000, current.time * 1000 + intervalSeconds * 1000 + 30_000)).toISOString();
  const metric = (key: string) => typeof current[key] === "number" && Number.isFinite(current[key]) ? current[key] as number : null;
  return { eventId, areaName, latitude, longitude, intervalSeconds, nextRefreshAt, fetchedAt: new Date(now).toISOString(), observation: {
    stationId: eventId, stationName: areaName, observedAt, source: "Open-Meteo · 기상모델", sourceMode: "LIVE" as const,
    temperatureC: metric("temperature_2m"), humidityPct: metric("relative_humidity_2m"), windSpeedMps: metric("wind_speed_10m"), windDirectionDeg: metric("wind_direction_10m"), windGustMps: metric("wind_gusts_10m"), precipitationMm: metric("precipitation"), surfacePressureHpa: metric("surface_pressure"), precipitationPeriodMinutes: intervalSeconds / 60, intervalSeconds,
  } };
}
