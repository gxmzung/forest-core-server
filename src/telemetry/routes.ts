import { Hono } from "hono";
import { parseDroneTelemetry } from "./schema.js";

export const telemetryRoutes = new Hono();

telemetryRoutes.post("/drone", async (c) => {
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json({
      error: {
        code: "INVALID_REQUEST",
        message: "JSON 요청 본문이 필요합니다."
      }
    }, 400);
  }

  try {
    const telemetry = parseDroneTelemetry(body);

    return c.json({
      data: {
        accepted: true,
        droneId: telemetry.droneId,
        observedAt: telemetry.timestamp,
        position: {
          latitude: telemetry.latitude,
          longitude: telemetry.longitude,
          altitude: telemetry.altitude
        }
      }
    }, 202);
  } catch (error) {
    return c.json({
      error: {
        code: "INVALID_TELEMETRY",
        message: error instanceof Error
          ? error.message
          : "telemetry payload is invalid"
      }
    }, 400);
  }
});
