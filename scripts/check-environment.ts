import { weatherApp } from "../src/external/weather-app.js";
const [latitude, longitude] = process.argv.slice(2);
if (!latitude?.trim() || !longitude?.trim()) { console.error("사용법: npm run check:environment -- 위도 경도"); process.exitCode = 1; }
else {
  const paths = [
    ["기상청 실황", `/api/v1/external/weather?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`],
    ["산림청 산불위험", "/api/v1/external/environment/wildfire-risk"],
    ["에어코리아 인근 측정소", `/api/v1/external/environment/air-quality?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`],
  ];
  const results = await Promise.all(paths.map(async ([source, path]) => {
    const response = await weatherApp.request(path!);
    const body = await response.json();
    if (!response.ok) process.exitCode = 1;
    const display = Array.isArray(body.data) && !process.argv.includes("--full")
      ? { recordsReceived: body.data.length, sample: body.data.slice(0, 3), meta: body.meta }
      : body;
    return { source, httpStatus: response.status, ...display };
  }));
  console.log(JSON.stringify(results, null, 2));
}
