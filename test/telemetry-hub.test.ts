import assert from "node:assert/strict";
import test from "node:test";
import { createTelemetryHub } from "../src/telemetry/hub.js";

test("telemetry hub publishes frontend-compatible messages", () => {
  const hub = createTelemetryHub();
  const messages: unknown[] = [];

  const unsubscribe = hub.subscribe((message) => {
    messages.push(message);
  });

  const first = hub.publish({
    droneId: "drone-01",
    timestamp: "2026-09-22T01:00:00Z",
    receivedAt: "2026-09-22T01:00:00.100Z",
    latitude: 36.3504,
    longitude: 127.3845,
    altitude: 120.5
  });

  const second = hub.publish({
    droneId: "drone-01",
    timestamp: "2026-09-22T01:00:01Z",
    receivedAt: "2026-09-22T01:00:01.100Z",
    latitude: 36.3505,
    longitude: 127.3846,
    altitude: 121
  });

  unsubscribe();

  assert.equal(messages.length, 2);
  assert.equal(first.assetId, "drone-01");
  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(second.assetType, "UAV");
  assert.equal(second.latitude, 36.3505);
});
