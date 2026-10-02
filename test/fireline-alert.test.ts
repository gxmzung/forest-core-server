import test from "node:test";
import assert from "node:assert/strict";

import {
  mkdtemp,
  rm,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  FirelineApproachEngine,
  pointToFirelineDistanceM,
} from "../src/alerts/fireline.js";

import {
  FirelineAlertCoordinator,
} from "../src/alerts/fireline-coordinator.js";

import {
  RequirementKpiEngine,
} from "../src/kpi/engine.js";

import {
  createFieldLinkApp,
} from "../src/fieldlink/app.js";

import {
  FieldLinkStore,
} from "../src/fieldlink/store.js";

test(
  "LineString과 위치 사이 실제 최단거리를 계산한다",
  () => {
    const distance =
      pointToFirelineDistanceM(
        127.0005,
        36.0005,
        [
          [
            127.0000,
            36.0000,
          ],
          [
            127.0010,
            36.0000,
          ],
        ],
      );

    assert.ok(
      distance > 50 &&
      distance < 60,
    );
  },
);

test(
  "화선 접근은 진입 1회만 경보하고 이탈 후 재진입 시 다시 경보한다",
  () => {
    const engine =
      new FirelineApproachEngine();

    engine.upsertRule({
      eventId:
        "EVENT-01",

      firelineId:
        "FIRELINE-01",

      coordinates: [
        [
          127.0000,
          36.0000,
        ],
        [
          127.0010,
          36.0000,
        ],
      ],

      thresholdM:
        80,

      clearDistanceM:
        120,

      cooldownSec:
        0,

      assetIds: [
        "CREW-01",
      ],
    });

    const first =
      engine.evaluate({
        assetId:
          "CREW-01",

        resourceType:
          "CREW",

        longitude:
          127.0005,

        latitude:
          36.0005,

        observedAt:
          "2026-10-01T00:00:00.000Z",
      });

    assert.equal(
      first.length,
      1,
    );

    const repeated =
      engine.evaluate({
        assetId:
          "CREW-01",

        longitude:
          127.0005,

        latitude:
          36.0005,

        observedAt:
          "2026-10-01T00:00:01.000Z",
      });

    assert.equal(
      repeated.length,
      0,
    );

    const cleared =
      engine.evaluate({
        assetId:
          "CREW-01",

        longitude:
          127.0005,

        latitude:
          36.0020,

        observedAt:
          "2026-10-01T00:00:02.000Z",
      });

    assert.equal(
      cleared.length,
      0,
    );

    const reentered =
      engine.evaluate({
        assetId:
          "CREW-01",

        longitude:
          127.0005,

        latitude:
          36.0005,

        observedAt:
          "2026-10-01T00:00:03.000Z",
      });

    assert.equal(
      reentered.length,
      1,
    );
  },
);

test(
  "자동 화선 경보 전달을 KPI 정보공유 시도와 전달에 반영한다",
  async () => {
    const engine =
      new FirelineApproachEngine();

    const kpi =
      new RequirementKpiEngine();

    kpi.startSession({
      sessionId:
        "KPI-01",

      eventId:
        "EVENT-01",

      startedAt:
        "2026-10-01T00:00:00.000Z",

      initialNetworkState:
        "UP",
    });

    engine.upsertRule({
      eventId:
        "EVENT-01",

      firelineId:
        "FIRELINE-01",

      coordinates: [
        [
          127.0000,
          36.0000,
        ],
        [
          127.0010,
          36.0000,
        ],
      ],

      thresholdM:
        100,

      assetIds: [
        "CREW-01",
      ],
    });

    const coordinator =
      new FirelineAlertCoordinator(
        engine,
        {
          kpi,

          deliverAlert:
            async () => ({
              deliveryId:
                "DELIVERY-01",

              sentAt:
                "2026-10-01T00:00:00.100Z",

              recipients:
                2,

              acknowledged:
                0,

              successRatePct:
                0,
            }),
        },
      );

    const rows =
      await coordinator
        .handlePosition({
          assetId:
            "CREW-01",

          longitude:
            127.0005,

          latitude:
            36.0005,

          observedAt:
            "2026-10-01T00:00:00.000Z",
        });

    assert.equal(
      rows.length,
      1,
    );

    assert.equal(
      rows[0]!.status,
      "DELIVERED",
    );

    let result =
      kpi.snapshot(
        "KPI-01",
        "2026-10-01T00:00:10.000Z",
      );

    assert.equal(
      result.sharing
        .attempted,
      1,
    );

    assert.equal(
      result.sharing
        .delivered,
      1,
    );

    assert.equal(
      result.sharing
        .acknowledged,
      0,
    );

    kpi.recordShareResult(
      "KPI-01",

      rows[0]!
        .event
        .sourceAlertId,

      {
        acknowledgedAt:
          "2026-10-01T00:00:00.500Z",
      },
    );

    result =
      kpi.snapshot(
        "KPI-01",
        "2026-10-01T00:00:10.000Z",
      );

    assert.equal(
      result.sharing
        .successPct,
      100,
    );
  },
);

test(
  "FieldLink ACK callback이 호출된다",
  async () => {
    const directory =
      await mkdtemp(
        join(
          tmpdir(),
          "fieldlink-fireline-",
        ),
      );

    try {
      const store =
        new FieldLinkStore(
          join(
            directory,
            "state.json",
          ),
        );

      let callbackId =
        "";

      const app =
        createFieldLinkApp({
          pin:
            "1234",

          store,

          onAlertAcknowledged:
            async (
              alert,
            ) => {
              callbackId =
                alert
                  .sourceAlertId;
            },
        });

      await app.request(
        "/api/v1/presence",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            "X-FieldLink-PIN":
              "1234",
          },

          body:
            JSON.stringify({
              clientId:
                "CLIENT-A",

              displayName:
                "현장 A",
            }),
        },
      );

      const response =
        await app.request(
          "/api/v1/alerts",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              "X-FieldLink-PIN":
                "1234",
            },

            body:
              JSON.stringify({
                sourceAlertId:
                  "FIRELINE-ALERT-01",

                severity:
                  "CRITICAL",

                title:
                  "화선 접근 경보",

                message:
                  "접근",

                source:
                  "FIRELINE_ENGINE",
              }),
          },
        );

      assert.equal(
        response.status,
        201,
      );

      const alert =
        await response
          .json() as any;

      const ack =
        await app.request(
          `/api/v1/alerts/${alert.deliveryId}/ack`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              "X-FieldLink-PIN":
                "1234",
            },

            body:
              JSON.stringify({
                clientId:
                  "CLIENT-A",

                displayName:
                  "현장 A",
              }),
          },
        );

      assert.equal(
        ack.status,
        200,
      );

      assert.equal(
        callbackId,
        "FIRELINE-ALERT-01",
      );
    } finally {
      await rm(
        directory,
        {
          recursive:
            true,

          force:
            true,
        },
      );
    }
  },
);
