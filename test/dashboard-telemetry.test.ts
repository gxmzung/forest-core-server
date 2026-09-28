import assert from "node:assert/strict";
import test from "node:test";
import { readDashboardDroneTelemetry } from "../src/dashboard/telemetry.js";
import { createMemoryTelemetryStore } from "../src/telemetry/store.js";

test("dashboard telemetry returns latest physical drone position", () => {
  const store = createMemoryTelemetryStore();

  store.put({
    droneId: "SITL-001",
    timestamp: "2026-09-28T02:00:00Z",
    latitude: -35.3633515,
    longitude: 149.1652412,
    altitude: 587.15
  });

  const rows =
    readDashboardDroneTelemetry(
      "field-md1000-local",
      store
    );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].eventId, "field-md1000-local");
  assert.equal(rows[0].assetId, "SITL-001");
  assert.equal(rows[0].sourceAssetId, "SITL-001");
  assert.equal(rows[0].latitude, -35.3633515);
  assert.equal(rows[0].longitude, 149.1652412);
  assert.equal(rows[0].altitude, 587.15);
});