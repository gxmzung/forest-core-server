import { Hono } from "hono";
import { cors } from "hono/cors";
import { weatherRoutes } from "./routes.js";

// 로컬 날씨 조회만 제공한다. 운영 DB·장비 제어 경로를 마운트하지 않는다.
export const weatherApp = new Hono();
weatherApp.use("*", cors({
  origin: ["http://127.0.0.1:15173", "http://localhost:15173"],
  allowMethods: ["GET", "OPTIONS"],
  allowHeaders: ["Content-Type"],
}));
weatherApp.get("/health", (c) => c.json({ status: "ok", service: "local-weather-readonly", configured: Boolean(process.env.KMA_WEATHER_SERVICE_KEY?.trim()) }));
weatherApp.route("/api/v1/external", weatherRoutes);
