import { serve } from "@hono/node-server";
import { weatherApp } from "../src/external/weather-app.js";

serve({ fetch: weatherApp.fetch, hostname: "127.0.0.1", port: 18891 }, () => {
  console.log("날씨 전용 서버: http://127.0.0.1:18891 (종료: Ctrl+C)");
  console.log(`기상청 키: ${process.env.KMA_WEATHER_SERVICE_KEY?.trim() ? "설정됨" : "설정 필요"} · DB/장비 제어 없음`);
});
