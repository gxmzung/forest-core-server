import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { createTelemetryRoutes } from "../src/telemetry/routes.js";
import { parseDroneTelemetry } from "../src/telemetry/schema.js";
import { createMemoryTelemetryStore } from "../src/telemetry/store.js";

test("parses valid drone telemetry", () => {
  const telemetry = parseDroneTelemetry({
    droneId: "drone-local-test",
    timestamp: "2026-09-22T00:44:25.617Z",
    latitude: 36.3504,
    longitude: 127.3845,
    altitude: 120.5
  });

  assert.equal(telemetry.droneId, "drone-local-test");
  assert.equal(telemetry.latitude, 36.3504);
});

test("rejects invalid coordinates", () => {
  assert.throws(() => parseDroneTelemetry({
    droneId: "drone-local-test",
    timestamp: new Date().toISOString(),
    latitude: 91,
    longitude: 127.3845,
    altitude: 120.5
  }), /latitude/);
});

test("stores and reads latest telemetry", () => {
  const store = createMemoryTelemetryStore();

  store.put({
    droneId: "drone-01",
    timestamp: "2026-09-22T01:00:00Z",
    latitude: 36.35,
    longitude: 127.38,
    altitude: 100
  });

  const latest = store.get("drone-01");

  assert.ok(latest);
  assert.equal(latest.altitude, 100);
});

test("does not replace latest telemetry with older packet", () => {
  const store = createMemoryTelemetryStore();

  store.put({
    droneId: "drone-01",
    timestamp: "2026-09-22T01:01:00Z",
    latitude: 36.36,
    longitude: 127.39,
    altitude: 110
  });

  store.put({
    droneId: "drone-01",
    timestamp: "2026-09-22T01:00:00Z",
    latitude: 36.35,
    longitude: 127.38,
    altitude: 100
  });

  assert.equal(store.get("drone-01")?.altitude, 110);
});

test("accepts telemetry and exposes latest HTTP route", async () => {
  const store = createMemoryTelemetryStore();
  const app = new Hono();

  app.route(
    "/internal/v1/telemetry",
    createTelemetryRoutes(store)
  );

  const ingest = await app.request(
    "/internal/v1/telemetry/drone",
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        droneId: "drone-http-test",
        timestamp: "2026-09-22T01:02:00Z",
        latitude: 36.3504,
        longitude: 127.3845,
        altitude: 121.7
      })
    }
  );

  assert.equal(ingest.status, 202);

  const latest = await app.request(
    "/internal/v1/telemetry/drone/drone-http-test/latest"
  );

  assert.equal(latest.status, 200);

  const body = await latest.json() as {
    data: {
      droneId: string;
      position: {
        altitude: number;
      };
    };
  };

  assert.equal(body.data.droneId, "drone-http-test");
  assert.equal(body.data.position.altitude, 121.7);
});

test("returns 404 when latest telemetry does not exist", async () => {
  const app = new Hono();

  app.route(
    "/internal/v1/telemetry",
    createTelemetryRoutes(createMemoryTelemetryStore())
  );

  const response = await app.request(
    "/internal/v1/telemetry/drone/unknown/latest"
  );

  assert.equal(response.status, 404);
});

test("accepts GPS quality telemetry fields", () => {
  const telemetry = parseDroneTelemetry({
    droneId: "SITL-001",
    timestamp: "2026-09-28T07:30:00Z",
    latitude: -35.3633515,
    longitude: 149.1652412,
    altitude: 587,
    positionSource: "GLOBAL_POSITION_INT(33)",
    gpsFixType: 6,
    satellitesVisible: 18,
    hdop: 0.85,
    vdop: 1.2,
    horizontalAccuracy: 0.35,
    verticalAccuracy: 0.65
  });

  assert.equal(telemetry.gpsFixType, 6);
  assert.equal(telemetry.satellitesVisible, 18);
  assert.equal(telemetry.hdop, 0.85);
  assert.equal(telemetry.horizontalAccuracy, 0.35);
});

