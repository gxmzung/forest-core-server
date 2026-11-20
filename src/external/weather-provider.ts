import { get } from "node:https";
import { fetchWithTimeout } from "./fetch-with-timeout.js";

// Provider regional nodes confirmed in open-meteo/open-meteo#2329.
// Keep the official hostname/SNI/certificate verification; never change system DNS.
const regionalNodes = ["167.114.211.86", "157.90.83.168"];

function regionalRequest(url: URL, address: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = get(url, {
      family: 4,
      lookup: (_hostname, _options, callback) => callback(null, address, 4),
    }, response => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Weather provider HTTP ${response.statusCode}`));
        return;
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        body += chunk;
        if (body.length > 100_000) request.destroy(new Error("Weather response too large"));
      });
      response.on("error", reject);
      response.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    const timer = setTimeout(() => request.destroy(new Error("Weather regional request timed out")), 2500);
    request.on("error", reject);
    request.on("close", () => clearTimeout(timer));
  });
}

export async function fetchWeatherProvider(url: URL): Promise<unknown> {
  // Regional routing is restricted to this fixed provider, including TLS hostname.
  if (url.origin !== "https://api.open-meteo.com") throw new Error("Invalid weather provider");
  try {
    const response = await fetchWithTimeout(url, {}, 2500);
    if (response.ok) return await response.json();
    if (response.status < 500) throw new Error(`Weather provider HTTP ${response.status}`);
  } catch (error) {
    if (error instanceof Error && /Weather provider HTTP 4/.test(error.message)) throw error;
  }
  for (const address of regionalNodes) {
    try { return await regionalRequest(url, address); } catch { /* Try the next provider node. */ }
  }
  throw new Error("Weather provider unavailable");
}
