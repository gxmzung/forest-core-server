import { upgradeWebSocket } from "@hono/node-server";
import { Hono } from "hono";
import type { WSContext } from "hono/ws";
import {
  telemetryHub,
  type TelemetryHub,
  type TelemetryStreamMessage
} from "./hub.js";

type Subscription = {
  eventId: string;
};

function parseSubscription(raw: unknown): Subscription | null {
  try {
    const value =
      typeof raw === "string"
        ? JSON.parse(raw)
        : JSON.parse(String(raw));

    if (
      !value ||
      typeof value !== "object" ||
      String(value.type ?? "").toUpperCase() !== "SUBSCRIBE"
    ) {
      return null;
    }

    const eventId = String(value.eventId ?? "").trim();
    return eventId ? { eventId } : null;
  } catch {
    return null;
  }
}

export function createTelemetryWebSocketRoutes(
  hub: TelemetryHub = telemetryHub
) {
  const routes = new Hono();

  routes.get(
    "/stream",
    upgradeWebSocket(() => {
      let subscribed: Subscription | null = null;
      let unsubscribe: (() => void) | null = null;

      return {
        onOpen(_event, ws) {
          unsubscribe = hub.subscribe(
            (message: TelemetryStreamMessage) => {
              if (!subscribed) return;

              if (ws.readyState === 1) {
                ws.send(JSON.stringify(message));
              }
            }
          );
        },

        onMessage(event, _ws: WSContext) {
          subscribed = parseSubscription(event.data);
        },

        onClose() {
          unsubscribe?.();
          unsubscribe = null;
        },

        onError() {
          unsubscribe?.();
          unsubscribe = null;
        }
      };
    })
  );

  return routes;
}

export const telemetryWebSocketRoutes =
  createTelemetryWebSocketRoutes();
