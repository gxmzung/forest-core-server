import assert from "node:assert/strict";
import test from "node:test";
import { parseDroneTelemetry } from "../src/telemetry/schema.js";
import { createTelemetryRoutes } from "../src/telemetry/routes.js";
import { createMemoryTelemetryStore } from "../src/telemetry/store.js";
import { createTelemetryHub } from "../src/telemetry/hub.js";

const valid = {
  droneId: "drone-validation",
  timestamp: "2026-09-22T01:54:17.008Z",
  latitude: 36.3504,
  longitude: 127.3845,
  altitude: 120.5
};

test("rejects null numeric telemetry fields", () => {
  for (const field of ["latitude", "longitude", "altitude"] as const) {
    assert.throws(
      () => parseDroneTelemetry({ ...valid, [field]: null }),
      new RegExp(`${field} is invalid`)
    );
  }
});

test("rejects numeric strings instead of coercing them", () => {
  assert.throws(
    () => parseDroneTelemetry({ ...valid, latitude: "36.3504" }),
    /latitude is invalid/
  );
});

test("rejects non ISO-8601 timestamp", () => {
  assert.throws(
    () => parseDroneTelemetry({ ...valid, timestamp: "2026/09/22 10:54:17" }),
    /timestamp must be ISO-8601/
  );
});

test("accepts ISO-8601 timestamp with timezone offset", () => {
  const telemetry = parseDroneTelemetry({
    ...valid,
    timestamp: "2026-09-22T10:54:17+09:00"
  });

  assert.equal(telemetry.timestamp, "2026-09-22T10:54:17+09:00");
});


test("accepts validated MAVLink link-quality metrics", () => {
  const telemetry = parseDroneTelemetry({
    ...valid,
    mavlinkVersion: 2,
    mavlinkSystemId: 1,
    mavlinkComponentId: 1,
    mavlinkSequence: 42,
    mavlinkMessageId: 33,
    qualityWindowExpected: 100,
    qualityWindowReceived: 99,
    qualityWindowLost: 1,
    packetLossPct: 1,
    periodAvgMs: 64.01,
    periodP95Ms: 78,
    periodMaxMs: 82
  });

  assert.equal(telemetry.packetLossPct, 1);
  assert.equal(telemetry.periodP95Ms, 78);
  assert.equal(telemetry.mavlinkSequence, 42);
});

test("rejects out-of-range packet loss", () => {
  assert.throws(
    () => parseDroneTelemetry({ ...valid, packetLossPct: 101 }),
    /packetLossPct is invalid/
  );
});

test("HTTP route rejects malformed JSON", async () => {
  const routes = createTelemetryRoutes(
    createMemoryTelemetryStore(),
    createTelemetryHub()
  );

  const response = await routes.request("/drone", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: '{"droneId":'
  });

  assert.equal(response.status, 400);

  const body = await response.json() as {
    error?: {
      code?: string;
    };
  };

  assert.equal(body.error?.code, "INVALID_REQUEST");
});

test("HTTP route rejects null coordinates", async () => {
  const routes = createTelemetryRoutes(
    createMemoryTelemetryStore(),
    createTelemetryHub()
  );

  const response = await routes.request("/drone", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      ...valid,
      latitude: null
    })
  });

  assert.equal(response.status, 400);
});
