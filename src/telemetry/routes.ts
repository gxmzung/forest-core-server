import { Hono } from "hono";
import { parseDroneTelemetry } from "./schema.js";
import { telemetryHub, type TelemetryHub } from "./hub.js";
import {
  telemetryStore,
  type TelemetryStore
} from "./store.js";
import {
  requirementKpiEngine
} from "../kpi/engine.js";

export function createTelemetryRoutes(
  store: TelemetryStore = telemetryStore,
  hub: TelemetryHub = telemetryHub
) {
  const routes = new Hono();

  routes.post("/drone", async (c) => {
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
      const previous = store.get(telemetry.droneId);
      const stored = store.put(telemetry);

      const acceptedAsLatest =
        previous == null ||
        Date.parse(telemetry.timestamp) >=
          Date.parse(previous.timestamp);

      if (acceptedAsLatest) {
        hub.publish(stored);

        requirementKpiEngine
          .recordLocationUpdateForActiveSessions({
            assetId:
              stored.droneId,

            observedAt:
              stored.timestamp,

            receivedAt:
              stored.receivedAt
          });
      }

      return c.json({
        data: {
          accepted: true,
          droneId: stored.droneId,
          observedAt: stored.timestamp,
          receivedAt: stored.receivedAt,

          position: {
            latitude: stored.latitude,
            longitude: stored.longitude,
            altitude: stored.altitude,
            source: stored.positionSource
          },

          gpsQuality: {
            fixType: stored.gpsFixType,
            satellitesVisible: stored.satellitesVisible,
            hdop: stored.hdop,
            vdop: stored.vdop,
            horizontalAccuracy: stored.horizontalAccuracy,
            verticalAccuracy: stored.verticalAccuracy
          }
        }
      }, 202);
    } catch (error) {
      return c.json({
        error: {
          code: "INVALID_TELEMETRY",
          message:
            error instanceof Error
              ? error.message
              : "telemetry payload is invalid"
        }
      }, 400);
    }
  });

  routes.get("/drone/:droneId/latest", (c) => {
    const droneId = c.req.param("droneId").trim();

    if (!droneId) {
      return c.json({
        error: {
          code: "INVALID_REQUEST",
          message: "droneId가 필요합니다."
        }
      }, 400);
    }

    const telemetry = store.get(droneId);

    if (!telemetry) {
      return c.json({
        error: {
          code: "TELEMETRY_NOT_FOUND",
          message: "수신된 텔레메트리가 없습니다."
        }
      }, 404);
    }

    return c.json({
      data: {
        droneId: telemetry.droneId,
        observedAt: telemetry.timestamp,
        receivedAt: telemetry.receivedAt,

        position: {
          latitude: telemetry.latitude,
          longitude: telemetry.longitude,
          altitude: telemetry.altitude,
          source: telemetry.positionSource
        },

        gpsQuality: {
          fixType: telemetry.gpsFixType,
          satellitesVisible: telemetry.satellitesVisible,
          hdop: telemetry.hdop,
          vdop: telemetry.vdop,
          horizontalAccuracy: telemetry.horizontalAccuracy,
          verticalAccuracy: telemetry.verticalAccuracy
        }
      }
    });
  });

  return routes;
}

export const telemetryRoutes = createTelemetryRoutes();
