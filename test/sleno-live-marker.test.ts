import assert from "node:assert/strict";
import test from "node:test";

import {
  clearLiveSlenoRows,
  rememberLiveSleno,
} from "../src/device/live-sleno.js";

import {
  readSlenoDashboardTelemetry,
} from "../src/dashboard/sleno-telemetry.js";

test(
  "Sleno live RTK packet is exposed without waiting for DB persistence",
  async () => {
    clearLiveSlenoRows();

    rememberLiveSleno(
      "JININFRA",
      {
        payloadType:
          "RTK_POSITION",

        context: {
          eventExternalId:
            "RTK-router-live-test",

          sourceSystem:
            "sleno-server",

          occurredAt:
            "2026-10-02T15:35:24.221+09:00",

          sourceDeviceId:
            "SIM-RTK-01",
        },

        relatedDeviceIds: [],

        activePath: [
          {
            sequence: 1,

            fromDeviceId:
              "SIM-RTK-01",

            toDeviceId:
              "SIM-RTK-BASE-01",

            medium:
              "LPWA",

            evidenceType:
              "OBSERVED",

            observations: [
              {
                receivedAt:
                  "2026-10-02T15:35:24.221+09:00",

                rssiDbm:
                  -68,

                snrDb:
                  13,

                selected:
                  true,
              },
            ],
          },
        ],

        data: {
          networkType:
            "LORAWAN",

          devEui:
            "4652535256303031",

          frameCounter:
            43400,

          latitude:
            37.42381865,

          longitude:
            126.88741393,

          altitude:
            89.4,

          fixType:
            "DGPS",
        },
      },

      [
        {
          vendorDeviceId:
            "SIM-RTK-01",

          assetId:
            "20000000-0000-4000-8000-000000000004",

          mapped:
            true,

          assetExists:
            true,

          mappingStatus:
            "ACTIVE",
        },

        {
          vendorDeviceId:
            "SIM-RTK-BASE-01",

          assetId:
            "20000000-0000-4000-8000-000000000009",

          mapped:
            true,

          assetExists:
            true,

          mappingStatus:
            "ACTIVE",
        },
      ],
    );

    let databaseReaderCalled =
      false;

    const result =
      await readSlenoDashboardTelemetry(
        "demo-wildfire-deoksungsan",

        async () => {
          databaseReaderCalled =
            true;

          return [];
        },

        Date.parse(
          "2026-10-02T15:35:25.221+09:00"
        ),
      );

    assert.equal(
      databaseReaderCalled,
      false,
    );

    assert.equal(
      result.length,
      1,
    );

    const marker =
      result[0];

    assert.ok(marker);

    assert.equal(
      marker.assetId,
      "20000000-0000-4000-8000-000000000004",
    );

    assert.equal(
      marker.assetType,
      "RTK_TERMINAL",
    );

    assert.equal(
      marker.latitude,
      37.42381865,
    );

    assert.equal(
      marker.longitude,
      126.88741393,
    );

    assert.equal(
      marker.operationalStatus,
      "ACTIVE",
    );

    assert.equal(
      (
        marker.attributes as
          Record<string, unknown>
      ).persistenceStatus,
      "LIVE_UNPERSISTED",
    );

    clearLiveSlenoRows();
  },
);
