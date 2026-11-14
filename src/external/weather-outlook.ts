import { observationBase, WeatherError } from "./weather.js";

type Grid = { nx: number; ny: number };
type Base = { date: string; time: string };
type Options = { serviceKey: string; now?: Date; fetcher?: typeof fetch };
export type ForecastPeriod = { validAt: string; temperatureC: number | null; humidityPct: number | null; windSpeedMps: number | null; windDirectionDeg: number | null; precipitationType: number | null; precipitationText: string | null };
export type WeatherForecast = { issuedAt: string; grid: Grid; periods: ForecastPeriod[] };
export type WeatherWarnings = { scope: "NATIONWIDE"; issuedAt: string; effectiveAt: string; checkedAt: string; text: string; preliminaryText: string | null };

export function kmaTime(date: string, time: string): string {
  if (!/^\d{8}$/.test(date) || !/^\d{4}$/.test(time)) throw new WeatherError("INVALID_RESPONSE", "기상청 자료 시각 형식을 확인하세요.");
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2)}:00+09:00`;
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime()) || new Date(parsed.getTime() + 9 * 3600_000).toISOString().slice(0, 16) !== iso.slice(0, 16)) throw new WeatherError("INVALID_RESPONSE", "유효하지 않은 기상청 자료 시각입니다.");
  return iso;
}

function items(payload: unknown): Record<string, unknown>[] {
  const result = (payload as { response?: { header?: { resultCode?: string }; body?: { items?: { item?: unknown } } } })?.response;
  if (result?.header?.resultCode === "03") throw new WeatherError("NO_DATA", "기상청 자료가 아직 없습니다. 특보 없음으로 판단하지 않습니다.");
  if (result?.header?.resultCode !== "00") throw new WeatherError("PROVIDER_REJECTED", "기상청 해당 서비스 활용신청·인증키·이용 권한을 확인하세요.");
  const raw = result.body?.items?.item;
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  if (!list.length || list.some((item) => !item || typeof item !== "object" || Array.isArray(item))) throw new WeatherError("NO_DATA", "기상청 자료를 확인하지 못했습니다.");
  return list as Record<string, unknown>[];
}

const numeric = (raw: unknown, min: number, max: number): number | null => {
  if (raw == null || !["number", "string"].includes(typeof raw) || String(raw).trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
};
const rainType = (raw: unknown) => {
  const value = numeric(raw, 0, 7);
  return value !== null && [0, 1, 2, 3, 5, 6, 7].includes(value) ? value : null;
};
function rainText(raw: unknown) {
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  const text = String(raw).trim();
  // Preserve provider ranges such as "1.0mm 미만"; never turn them into zero.
  return /^(?:강수없음|\d+(?:\.\d+)?(?:\s*(?:~|～|-)\s*\d+(?:\.\d+)?)?\s*(?:mm)?\s*(?:미만|이상)?)$/.test(text) ? text : null;
}

export function parseForecast(payload: unknown, grid: Grid, base: Base, now: Date): WeatherForecast {
  const matching = items(payload).filter((item) => item.baseDate === base.date && item.baseTime === base.time && Number(item.nx) === grid.nx && Number(item.ny) === grid.ny);
  if (!matching.length) throw new WeatherError("INVALID_RESPONSE", "요청 발표시각·격자와 다른 예보 자료입니다.");
  const groups = new Map<string, Record<string, unknown>>();
  for (const item of matching) {
    const validAt = kmaTime(String(item.fcstDate ?? ""), String(item.fcstTime ?? ""));
    if (Date.parse(validAt) <= now.getTime() || Date.parse(validAt) > now.getTime() + 6 * 3600_000) continue;
    const row = groups.get(validAt) ?? {};
    if (typeof item.category === "string") row[item.category] = item.fcstValue;
    groups.set(validAt, row);
  }
  const periods = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([validAt, row]) => ({
    validAt, temperatureC: numeric(row.T1H, -90, 60), humidityPct: numeric(row.REH, 0, 100), windSpeedMps: numeric(row.WSD, 0, 150), windDirectionDeg: numeric(row.VEC, 0, 360), precipitationType: rainType(row.PTY), precipitationText: rainText(row.RN1),
  })).filter((row) => Object.entries(row).some(([key, value]) => key !== "validAt" && value !== null)).slice(0, 6);
  if (!periods.length) throw new WeatherError("NO_DATA", "표시 가능한 향후 예보가 없습니다.");
  return { issuedAt: kmaTime(base.date, base.time), grid, periods };
}

async function request(url: URL, options: Options) {
  let key = options.serviceKey.trim();
  if (!key) throw new WeatherError("NOT_CONFIGURED", "기상청 인증키 서버 설정이 필요합니다.", 503);
  try { key = decodeURIComponent(key); } catch { /* raw key */ }
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("dataType", "JSON"); url.searchParams.set("pageNo", "1"); url.searchParams.set("numOfRows", "1000");
  try {
    const response = await (options.fetcher ?? fetch)(url, { signal: AbortSignal.timeout(3500) });
    if (!response.ok) throw new WeatherError("PROVIDER_HTTP_ERROR", `기상청 응답 오류: HTTP ${response.status}`);
    return await response.json() as unknown;
  } catch (error) {
    if (error instanceof WeatherError) throw error;
    throw new WeatherError("PROVIDER_UNAVAILABLE", "기상청 응답을 받지 못했습니다. 연결·응답 형식을 확인하세요.");
  }
}

export async function fetchForecast(grid: Grid, options: Options): Promise<WeatherForecast> {
  const now = options.now ?? new Date();
  for (const hoursBack of [1, 2]) {
    const previous = observationBase(now, hoursBack);
    const base = { ...previous, time: `${previous.time.slice(0, 2)}30` };
    const url = new URL("https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst");
    for (const [key, value] of Object.entries({ base_date: base.date, base_time: base.time, nx: grid.nx, ny: grid.ny })) url.searchParams.set(key, String(value));
    try { return parseForecast(await request(url, options), grid, base, now); }
    catch (error) { if (hoursBack === 1 && error instanceof WeatherError && error.code === "NO_DATA") continue; throw error; }
  }
  throw new WeatherError("NO_DATA", "예보 자료가 없습니다.");
}

function bulletinTime(raw: unknown): string {
  const text = String(raw ?? "");
  if (!/^\d{12}$/.test(text)) throw new WeatherError("INVALID_RESPONSE", "특보 시각 형식을 확인하세요.");
  return kmaTime(text.slice(0, 8), text.slice(8));
}
function bulletinText(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, 12000);
}
export function parseWarnings(payload: unknown, now: Date): WeatherWarnings {
  const records = items(payload).map((row) => ({ row, issuedAt: bulletinTime(row.tmFc) })).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  const latest = records[0]!;
  const age = now.getTime() - Date.parse(latest.issuedAt);
  if (age < -300_000 || age > 7 * 24 * 3600_000) throw new WeatherError("INVALID_RESPONSE", "특보 현황의 발표시각을 확인하세요.");
  const text = bulletinText(latest.row.t6);
  if (!text) throw new WeatherError("NO_DATA", "특보 현황 본문이 없습니다. 특보 없음으로 판단하지 않습니다.");
  return { scope: "NATIONWIDE", issuedAt: latest.issuedAt, effectiveAt: bulletinTime(latest.row.tmEf), checkedAt: now.toISOString(), text, preliminaryText: bulletinText(latest.row.t7) };
}

export async function fetchWarnings(options: Options): Promise<WeatherWarnings> {
  const url = new URL("https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus");
  return parseWarnings(await request(url, options), options.now ?? new Date());
}
