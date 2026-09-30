import assert from "node:assert/strict";
import test from "node:test";

import {
  parseDroneTelemetry
} from "../src/telemetry/schema.js";

import {
  createMemoryTelemetryStore
} from "../src/telemetry/store.js";

import {
  readDashboardDroneTelemetry
} from "../src/dashboard/telemetry.js";

test(
  "NET-01 preserves Uplink to Core path evidence",
  () => {
    const telemetry =
      parseDroneTelemetry({
        droneId: "MD1000-NET01",

        timestamp:
          "2026-09-29T06:00:00.000Z",

        latitude: 36.351,
        longitude: 127.385,
        altitude: 120,

        pathEvidence: {
          uplinkReceivedAt:
            "2026-09-29T06:00:00.010Z",

          uplinkForwardStartedAt:
            "2026-09-29T06:00:00.012Z",

          uplinkSource:
            "127.0.0.1:14550",

          uplinkBytes: 128,

          transport:
            "UDP_TO_HTTP"
        }
      });

    assert.equal(
      telemetry.pathEvidence
        ?.uplinkReceivedAt,
      "2026-09-29T06:00:00.010Z"
    );

    assert.equal(
      telemetry.pathEvidence
        ?.transport,
      "UDP_TO_HTTP"
    );

    const store =
      createMemoryTelemetryStore();

    store.put(telemetry);

    const rows =
      readDashboardDroneTelemetry(
        "e2e-md1000-local",
        store
      );

    assert.equal(rows.length, 1);

    const evidence =
      rows[0].attributes.pathEvidence;

    assert.equal(
      evidence.uplinkReceivedAt,
      "2026-09-29T06:00:00.010Z"
    );

    assert.equal(
      evidence.uplinkForwardStartedAt,
      "2026-09-29T06:00:00.012Z"
    );

    assert.equal(
      evidence.uplinkSource,
      "127.0.0.1:14550"
    );

    assert.equal(
      evidence.uplinkBytes,
      128
    );

    assert.equal(
      evidence.transport,
      "UDP_TO_HTTP"
    );

    assert.ok(
      Number.isFinite(
        Date.parse(
          evidence.coreReceivedAt
        )
      )
    );
  }
);

test(
  "NET-01 rejects malformed path timestamp",
  () => {
    assert.throws(
      () =>
        parseDroneTelemetry({
          droneId: "MD1000-NET01",
          timestamp:
            "2026-09-29T06:00:00.000Z",
          latitude: 36.351,
          longitude: 127.385,
          altitude: 120,

          pathEvidence: {
            uplinkReceivedAt:
              "not-a-time"
          }
        }),
      /pathEvidence\.uplinkReceivedAt/
    );
  }
);
