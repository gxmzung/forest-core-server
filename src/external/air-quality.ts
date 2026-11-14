import { createHash } from "node:crypto";
import { cachedExternal } from "./cache.js";
import { WeatherError, weatherGrid } from "./weather.js";

type Row = Record<string, unknown>;
export type AirStation = { name: string; address: string; latitude: number; longitude: number };
export type AirQuality = { station: AirStation; distanceKm: number; observedAt: string; pm10: number | null; pm25: number | null; pm10Flag: string | null; pm25Flag: string | null };
function number(raw: unknown): number | null {
  if (!(["string", "number"].includes(typeof raw)) || String(raw).trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
export function parseAirItems(payload: unknown): { rows: Row[]; total: number } {
  const response = (payload as { response?: { header?: { resultCode?: string }; body?: { items?: unknown; totalCount?: unknown } } })?.response;
  if (response?.header?.resultCode !== "00") throw new WeatherError("PROVIDER_REJECTED", "에어코리아 측정소정보·대기오염정보 활용신청 및 인증키 권한을 확인하세요.");
  const rows = response.body?.items;
  const total = number(response.body?.totalCount);
  if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row)) || total === null || !Number.isInteger(total)) throw new WeatherError("INVALID_RESPONSE", "에어코리아 자료 형식을 확인하세요.");
  return { rows: rows as Row[], total };
}
export function parseStations(rows: Row[]): AirStation[] {
  return rows.flatMap((row) => {
    const latitude = number(row.dmX), longitude = number(row.dmY);
    if (typeof row.stationName !== "string" || !row.stationName.trim() || latitude === null || longitude === null || latitude < 31 || latitude > 44 || longitude < 123 || longitude > 133) return [];
    return [{ name: row.stationName.trim(), address: typeof row.addr === "string" ? row.addr : "", latitude, longitude }];
  });
}
export function nearestStation(stations: AirStation[], latitude: number, longitude: number) {
  weatherGrid(latitude, longitude);
  const rad = Math.PI / 180;
  const ranked = stations.map((station) => {
    const a = Math.sin((station.latitude - latitude) * rad / 2) ** 2 + Math.cos(latitude * rad) * Math.cos(station.latitude * rad) * Math.sin((station.longitude - longitude) * rad / 2) ** 2;
    return { station, distanceKm: 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a))) };
  }).sort((a, b) => a.distanceKm - b.distanceKm);
  if (!ranked[0]) throw new WeatherError("NO_DATA", "좌표가 확인된 대기질 측정소가 없습니다.");
  return ranked[0];
}
export function parseAirQuality(rows: Row[], selected: { station: AirStation; distanceKm: number }): AirQuality {
  const parsed = rows.flatMap((row) => {
    if (row.stationName != null && row.stationName !== selected.station.name) return [];
    if (typeof row.dataTime !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(row.dataTime)) return [];
    const observedAt = row.dataTime.replace(" ", "T") + ":00+09:00";
    const stamp = Date.parse(observedAt);
    if (!Number.isFinite(stamp) || new Date(stamp + 9 * 3600_000).toISOString().slice(0, 16) !== observedAt.slice(0, 16)) return [];
    const flag = (raw: unknown) => typeof raw === "string" && raw.trim() && raw.trim() !== "-" ? raw.trim() : null;
    const pm10Flag = flag(row.pm10Flag), pm25Flag = flag(row.pm25Flag);
    return [{ ...selected, observedAt, pm10: pm10Flag ? null : number(row.pm10Value), pm25: pm25Flag ? null : number(row.pm25Value), pm10Flag, pm25Flag }];
  }).sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  if (!parsed[0]) throw new WeatherError("NO_DATA", "인근 측정소의 유효한 관측 시각을 확인하지 못했습니다.");
  return parsed[0];
}
async function request(path: string, key: string, query: Record<string, string>, fetcher: typeof fetch) {
  const stationService = path.startsWith("MsrstnInfoInqireSvc/");
  const serviceName = stationService ? "측정소정보" : "대기오염정보";
  const url = new URL(`https://apis.data.go.kr/B552584/${path}`);
  let decoded = key.trim();
  if (!decoded) throw new WeatherError("NOT_CONFIGURED", "에어코리아 API 인증키 서버 설정이 필요합니다.", 503);
  try { decoded = decodeURIComponent(decoded); } catch { /* decoded key */ }
  url.search = new URLSearchParams({ serviceKey: decoded, returnType: "json", ...query }).toString();
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      const auth = response.status === 401 || response.status === 403;
      const code = auth ? stationService ? "AIR_STATION_AUTH_FAILED" : "AIR_OBSERVATION_AUTH_FAILED" : "PROVIDER_HTTP_ERROR";
      throw new WeatherError(code, `에어코리아 ${serviceName} HTTP ${response.status}${auth ? " · 해당 서비스의 활용신청 승인 상태와 인증키를 확인하세요." : ""}`);
    }
    return parseAirItems(await response.json());
  } catch (error) {
    if (error instanceof WeatherError) throw error;
    throw new WeatherError("PROVIDER_UNAVAILABLE", "에어코리아 응답을 받지 못했습니다.");
  }
}
export async function fetchAirQuality(latitude: number, longitude: number, options: { serviceKey: string; fetcher?: typeof fetch }) {
  weatherGrid(latitude, longitude);
  if (!options.serviceKey.trim()) throw new WeatherError("NOT_CONFIGURED", "에어코리아 API 인증키 서버 설정이 필요합니다.", 503);
  const fetcher = options.fetcher ?? fetch;
  const scope = createHash("sha256").update(options.serviceKey.trim()).digest("hex").slice(0, 16);
  const list = await cachedExternal(`air-stations:${scope}`, async () => {
    const rows: Row[] = [];
    for (let page = 1; page <= 10; page++) {
      const result = await request("MsrstnInfoInqireSvc/getMsrstnList", options.serviceKey, { numOfRows: "1000", pageNo: String(page) }, fetcher);
      rows.push(...result.rows);
      if (rows.length >= result.total) return parseStations(rows);
      if (!result.rows.length) break;
    }
    throw new WeatherError("INVALID_RESPONSE", "측정소 전체 목록을 확인하지 못해 인근 측정소를 결정할 수 없습니다.");
  }, { ttlMs: 24 * 3600_000, staleIfErrorMs: 0 });
  const selected = nearestStation(list.value, latitude, longitude);
  const observation = await cachedExternal(`air-observation:${scope}:${selected.station.name}`, async () => {
    const result = await request("ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty", options.serviceKey, { stationName: selected.station.name, dataTerm: "DAILY", ver: "1.3", numOfRows: "24", pageNo: "1" }, fetcher);
    return parseAirQuality(result.rows, { ...selected, distanceKm: 0 });
  }, { ttlMs: 300_000, staleIfErrorMs: 900_000 });
  return { data: { ...observation.value, distanceKm: selected.distanceKm }, stale: observation.cache === "STALE" };
}
