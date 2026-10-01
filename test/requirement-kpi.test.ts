import test from "node:test";
import assert from "node:assert/strict";

import {
  RequirementKpiEngine,
} from "../src/kpi/engine.js";

test(
  "요구사항 KPI PASS 시나리오",
  () => {
    const engine =
      new RequirementKpiEngine();

    engine.startSession({
      sessionId:
        "RUN-PASS",

      eventId:
        "EVENT-01",

      startedAt:
        "2026-10-01T00:00:00.000Z",

      initialNetworkState:
        "UP",

      updateTargetSec:
        3,

      sharingTargetPct:
        98,

      availabilityTargetPct:
        98,

      deploymentTargetMinutes:
        7,
    });

    engine.recordLocationUpdate(
      "RUN-PASS",
      {
        assetId:
          "DRONE-01",
        observedAt:
          "2026-10-01T00:00:00.000Z",
        receivedAt:
          "2026-10-01T00:00:00.100Z",
      },
    );

    engine.recordLocationUpdate(
      "RUN-PASS",
      {
        assetId:
          "DRONE-01",
        observedAt:
          "2026-10-01T00:00:02.800Z",
        receivedAt:
          "2026-10-01T00:00:02.900Z",
      },
    );

    engine.recordLocationUpdate(
      "RUN-PASS",
      {
        assetId:
          "DRONE-01",
        observedAt:
          "2026-10-01T00:00:05.700Z",
        receivedAt:
          "2026-10-01T00:00:05.800Z",
      },
    );

    engine.recordNetworkState(
      "RUN-PASS",
      "DEGRADED",
      "2026-10-01T00:01:00.000Z",
    );

    engine.recordNetworkState(
      "RUN-PASS",
      "DOWN",
      "2026-10-01T00:01:30.000Z",
    );

    engine.recordNetworkState(
      "RUN-PASS",
      "UP",
      "2026-10-01T00:01:31.000Z",
    );

    engine.recordShareAttempt(
      "RUN-PASS",
      {
        messageId:
          "MSG-001",
        kind:
          "FIRELINE_ALERT",
        attemptedAt:
          "2026-10-01T00:00:20.000Z",
      },
    );

    engine.recordShareResult(
      "RUN-PASS",
      "MSG-001",
      {
        deliveredAt:
          "2026-10-01T00:00:20.200Z",
        acknowledgedAt:
          "2026-10-01T00:00:21.000Z",
      },
    );

    engine.recordShareAttempt(
      "RUN-PASS",
      {
        messageId:
          "MSG-002",
        kind:
          "POSITION",
        attemptedAt:
          "2026-10-01T00:00:30.000Z",
      },
    );

    engine.recordShareResult(
      "RUN-PASS",
      "MSG-002",
      {
        deliveredAt:
          "2026-10-01T00:00:30.100Z",
        acknowledgedAt:
          "2026-10-01T00:00:30.500Z",
      },
    );

    engine.stopSession(
      "RUN-PASS",
      "2026-10-01T00:01:40.000Z",
    );

    const result =
      engine.snapshot(
        "RUN-PASS",
      );

    assert.equal(
      result.locationUpdates
        .updateIntervalMaxSec,
      2.9,
    );

    assert.equal(
      result.network
        .availabilityPct,
      99,
    );

    assert.equal(
      result.sharing
        .attempted,
      2,
    );

    assert.equal(
      result.sharing
        .acknowledged,
      2,
    );

    assert.equal(
      result.sharing
        .successPct,
      100,
    );

    assert.equal(
      result.requirements
        .KPI01,
      "PASS",
    );

    assert.equal(
      result.requirements
        .KPI02,
      "PASS",
    );

    assert.equal(
      result.requirements
        .KPI03,
      "PASS",
    );

    assert.equal(
      result.requirements
        .KPI04,
      "PASS",
    );

    assert.equal(
      result.requirements
        .NET04,
      "PASS",
    );

    assert.equal(
      result.requirements
        .NET05,
      "PASS",
    );
  },
);

test(
  "요구사항 기준 미달을 FAIL로 계산",
  () => {
    const engine =
      new RequirementKpiEngine();

    engine.startSession({
      sessionId:
        "RUN-FAIL",

      eventId:
        "EVENT-02",

      startedAt:
        "2026-10-01T00:00:00.000Z",

      initialNetworkState:
        "UP",
    });

    engine.recordLocationUpdate(
      "RUN-FAIL",
      {
        assetId:
          "DRONE-02",
        observedAt:
          "2026-10-01T00:00:00.000Z",
        receivedAt:
          "2026-10-01T00:00:00.100Z",
      },
    );

    engine.recordLocationUpdate(
      "RUN-FAIL",
      {
        assetId:
          "DRONE-02",
        observedAt:
          "2026-10-01T00:00:04.000Z",
        receivedAt:
          "2026-10-01T00:00:04.100Z",
      },
    );

    engine.recordNetworkState(
      "RUN-FAIL",
      "DOWN",
      "2026-10-01T00:00:50.000Z",
    );

    engine.recordNetworkState(
      "RUN-FAIL",
      "UP",
      "2026-10-01T00:00:55.000Z",
    );

    engine.recordShareAttempt(
      "RUN-FAIL",
      {
        messageId:
          "MSG-A",
      },
    );

    engine.recordShareResult(
      "RUN-FAIL",
      "MSG-A",
      {
        deliveredAt:
          "2026-10-01T00:00:10.000Z",
        acknowledgedAt:
          "2026-10-01T00:00:11.000Z",
      },
    );

    engine.recordShareAttempt(
      "RUN-FAIL",
      {
        messageId:
          "MSG-B",
      },
    );

    engine.stopSession(
      "RUN-FAIL",
      "2026-10-01T00:01:40.000Z",
    );

    const result =
      engine.snapshot(
        "RUN-FAIL",
      );

    assert.equal(
      result.locationUpdates
        .updateIntervalMaxSec,
      4,
    );

    assert.equal(
      result.network
        .availabilityPct,
      95,
    );

    assert.equal(
      result.sharing
        .successPct,
      50,
    );

    assert.equal(
      result.requirements
        .KPI01,
      "FAIL",
    );

    assert.equal(
      result.requirements
        .KPI03,
      "FAIL",
    );

    assert.equal(
      result.requirements
        .KPI04,
      "FAIL",
    );
  },
);

test(
  "중복 정보공유 attempt는 분모를 늘리지 않는다",
  () => {
    const engine =
      new RequirementKpiEngine();

    engine.startSession({
      sessionId:
        "RUN-IDEMPOTENT",

      eventId:
        "EVENT-03",

      startedAt:
        "2026-10-01T00:00:00.000Z",
    });

    engine.recordShareAttempt(
      "RUN-IDEMPOTENT",
      {
        messageId:
          "SAME-001",
      },
    );

    engine.recordShareAttempt(
      "RUN-IDEMPOTENT",
      {
        messageId:
          "SAME-001",
      },
    );

    const result =
      engine.snapshot(
        "RUN-IDEMPOTENT",
        "2026-10-01T00:00:10.000Z",
      );

    assert.equal(
      result.sharing
        .attempted,
      1,
    );
  },
);
