import { fetchForecast, fetchWarnings } from "../src/external/weather-outlook.js";
import { fetchWeather, weatherGrid } from "../src/external/weather.js";

const [lat, lon] = process.argv.slice(2);
try {
  if (!lat?.trim() || !lon?.trim()) throw new Error("사용법: npm run check:weather:outlook -- 위도 경도");
  const grid = weatherGrid(Number(lat), Number(lon));
  const serviceKey = process.env.KMA_WEATHER_SERVICE_KEY ?? "";
  const checks = [
    { source: "기상청 초단기실황", read: () => fetchWeather(grid, { serviceKey }) },
    { source: "기상청 초단기예보", read: () => fetchForecast(grid, { serviceKey }) },
    { source: "기상청 전국 특보현황", read: () => fetchWarnings({ serviceKey: process.env.KMA_WARNING_SERVICE_KEY?.trim() || serviceKey }) },
  ];
  const results = await Promise.all(checks.map(async ({ source, read }) => {
    try { return { status: "ok", source, data: await read() }; }
    catch (error) { process.exitCode = 1; return { status: "failed", source, code: error && typeof error === "object" && "code" in error ? error.code : "CHECK_FAILED", message: error instanceof Error ? error.message : "자료 조회 실패" }; }
  }));
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "failed", message: error instanceof Error ? error.message : "조회 실패" }));
  process.exitCode = 1;
}
