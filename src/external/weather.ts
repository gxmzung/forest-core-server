export class WeatherError extends Error {
  constructor(readonly code: string, message: string, readonly status: 400 | 502 | 503 = 502) {
    super(message);
  }
}

// 기상청 동네예보 5km Lambert 격자. 원점 (126E, 38N) = (43, 136).
export function weatherGrid(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 31 || latitude > 44 || longitude < 123 || longitude > 133) {
    throw new WeatherError("INVALID_LOCATION", "국내 기상 격자에 해당하는 위도·경도를 입력하세요.", 400);
  }
  const rad = Math.PI / 180;
  const a = 30 * rad, b = 60 * rad;
  const n = Math.log(Math.cos(a) / Math.cos(b)) / Math.log(Math.tan(Math.PI / 4 + b / 2) / Math.tan(Math.PI / 4 + a / 2));
  const factor = Math.pow(Math.tan(Math.PI / 4 + a / 2), n) * Math.cos(a) / n;
  const origin = 6371.00877 / 5 * factor / Math.pow(Math.tan(Math.PI / 4 + 38 * rad / 2), n);
  const radius = 6371.00877 / 5 * factor / Math.pow(Math.tan(Math.PI / 4 + latitude * rad / 2), n);
  const theta = (longitude - 126) * rad * n;
  const nx = Math.floor(radius * Math.sin(theta) + 43 + 0.5);
  const ny = Math.floor(origin - radius * Math.cos(theta) + 136 + 0.5);
  if (nx < 1 || nx > 149 || ny < 1 || ny > 253) throw new WeatherError("INVALID_LOCATION", "기상청 격자 영역 밖입니다.", 400);
  return { nx, ny };
}

export function observationBase(now: Date, hoursBack = 1) {
  const kst = new Date(now.getTime() + 9 * 3600_000 - hoursBack * 3600_000);
  return { date: kst.toISOString().slice(0, 10).replaceAll("-", ""), time: `${String(kst.getUTCHours()).padStart(2, "0")}00` };
}

export type WeatherObservation = {
  observedAt: string;
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedMps: number | null;
  windDirectionDeg: number | null;
  grid: { nx: number; ny: number };
};

type Item = { category?: string; obsrValue?: unknown; baseDate?: string; baseTime?: string; nx?: number | string; ny?: number | string };

export function parseWeather(payload: unknown, grid: { nx: number; ny: number }, base: { date: string; time: string }): WeatherObservation {
  const body = (payload as { response?: { header?: { resultCode?: string }; body?: { items?: { item?: Item[] } } } })?.response;
  const code = body?.header?.resultCode;
  if (code === "03") throw new WeatherError("NO_DATA", "기상청 해당 시각 자료가 아직 없습니다.");
  if (code !== "00") throw new WeatherError("PROVIDER_REJECTED", "기상청 인증·이용 권한 또는 응답 상태를 확인하세요.");
  const items = body?.body?.items?.item;
  if (!Array.isArray(items) || items.length === 0) throw new WeatherError("NO_DATA", "기상청 해당 시각 자료가 없습니다.");
  const matching = items.filter((item) => item.baseDate === base.date && item.baseTime === base.time && Number(item.nx) === grid.nx && Number(item.ny) === grid.ny);
  if (!matching.length) throw new WeatherError("INVALID_RESPONSE", "요청 시각·격자와 다른 기상 자료입니다.");
  const read = (category: string, min: number, max: number) => {
    const raw = matching.find((item) => item.category === category)?.obsrValue;
    if (raw == null || String(raw).trim() === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= min && value <= max ? value : null;
  };
  const values = { temperatureC: read("T1H", -90, 60), humidityPct: read("REH", 0, 100), windSpeedMps: read("WSD", 0, 150), windDirectionDeg: read("VEC", 0, 360) };
  if (Object.values(values).every((value) => value === null)) throw new WeatherError("NO_DATA", "유효한 기상 관측값이 없습니다.");
  return { ...values, observedAt: `${base.date.slice(0, 4)}-${base.date.slice(4, 6)}-${base.date.slice(6, 8)}T${base.time.slice(0, 2)}:00:00+09:00`, grid };
}

export async function fetchWeather(grid: { nx: number; ny: number }, options: { serviceKey: string; now?: Date; fetcher?: typeof fetch }) {
  if (!options.serviceKey.trim()) throw new WeatherError("NOT_CONFIGURED", "기상청 API 인증키가 서버에 설정되지 않았습니다.", 503);
  let key = options.serviceKey.trim();
  try { key = decodeURIComponent(key); } catch { /* 디코딩 키를 그대로 사용 */ }
  const now = options.now ?? new Date();
  for (const hoursBack of [1, 2]) {
    const base = observationBase(now, hoursBack);
    const url = new URL("https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst");
    url.search = new URLSearchParams({ serviceKey: key, dataType: "JSON", pageNo: "1", numOfRows: "100", base_date: base.date, base_time: base.time, nx: String(grid.nx), ny: String(grid.ny) }).toString();
    try {
      const response = await (options.fetcher ?? fetch)(url, { signal: AbortSignal.timeout(3500) });
      if (!response.ok) throw new WeatherError("PROVIDER_HTTP_ERROR", `기상청 응답 오류: HTTP ${response.status}`);
      return parseWeather(await response.json(), grid, base);
    } catch (error) {
      if (error instanceof WeatherError) {
        if (error.code === "NO_DATA" && hoursBack === 1) continue;
        throw error;
      }
      // fetch 오류의 URL·인증키가 응답/로그로 노출되지 않도록 원문 오류를 전달하지 않는다.
      throw new WeatherError("PROVIDER_UNAVAILABLE", "기상청 응답을 받지 못했습니다. 연결 또는 응답 형식을 확인하세요.");
    }
  }
  throw new WeatherError("NO_DATA", "기상 자료가 없습니다.");
}
