import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { telemetryRoutes } from "../src/telemetry/routes.js";
import { parseDroneTelemetry } from "../src/telemetry/schema.js";

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

test("accepts telemetry through HTTP route", async () => {
  const app = new Hono();
  app.route("/internal/v1/telemetry", telemetryRoutes);

  const response = await app.request(
    "/internal/v1/telemetry/drone",
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        droneId: "drone-local-test",
        timestamp: "2026-09-22T00:44:25.617Z",
        latitude: 36.3504,
        longitude: 127.3845,
        altitude: 120.5
      })
    }
  );

  assert.equal(response.status, 202);

  const body = await response.json() as {
    data: {
      accepted: boolean;
      droneId: string;
    };
  };

  assert.equal(body.data.accepted, true);
  assert.equal(body.data.droneId, "drone-local-test");
});

test("rejects malformed telemetry through HTTP route", async () => {
  const app = new Hono();
  app.route("/internal/v1/telemetry", telemetryRoutes);

  const response = await app.request(
    "/internal/v1/telemetry/drone",
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        droneId: "",
        latitude: 999
      })
    }
  );

  assert.equal(response.status, 400);
});
