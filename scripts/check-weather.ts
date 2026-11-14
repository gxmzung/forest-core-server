import { fetchWeather, weatherGrid } from "../src/external/weather.js";

const [lat, lon] = process.argv.slice(2);
try {
  if (!lat?.trim() || !lon?.trim()) throw new Error("사용법: npm run check:weather -- 위도 경도");
  const grid = weatherGrid(Number(lat), Number(lon));
  const data = await fetchWeather(grid, { serviceKey: process.env.KMA_WEATHER_SERVICE_KEY ?? "" });
  console.log(JSON.stringify({ status: "ok", source: "기상청 초단기실황", data }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "failed", code: error && typeof error === "object" && "code" in error ? error.code : "CHECK_FAILED", message: error instanceof Error ? error.message : "날씨 조회 실패" }));
  process.exitCode = 1;
}
