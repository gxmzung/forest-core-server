import test from "node:test";
import assert from "node:assert/strict";

import {
  FieldOperationsEngine,
} from "../src/operations/field-operations.js";

test(
  "상황보고는 P0부터 우선 전송한다",
  () => {
    let time =
      Date.parse(
        "2026-10-01T00:00:00.000Z",
      );

    const engine =
      new FieldOperationsEngine(
        () =>
          new Date(
            time,
          ),
      );

    const p3 =
      engine.createSituationReport({
        eventId:
          "EVENT-01",
        authorId:
          "FIELD-01",
        authorName:
          "현장1",
        priority:
          "P3",
        title:
          "일반 상황",
        content:
          "이상 없음",
      });

    time += 1000;

    const p0 =
      engine.createSituationReport({
        eventId:
          "EVENT-01",
        authorId:
          "FIELD-02",
        authorName:
          "현장2",
        priority:
          "P0",
        title:
          "긴급 구조",
        content:
          "즉시 지원 필요",
      });

    const pending =
      engine.pendingReports();

    assert.equal(
      pending.length,
      2,
    );

    assert.equal(
      pending[0]!
        .reportId,
      p0.reportId,
    );

    assert.equal(
      pending[1]!
        .reportId,
      p3.reportId,
    );
  },
);

test(
  "전송 완료된 상황보고는 대기열에서 빠진다",
  () => {
    const engine =
      new FieldOperationsEngine();

    const report =
      engine.createSituationReport({
        eventId:
          "EVENT-02",
        authorId:
          "FIELD-01",
        authorName:
          "현장",
        priority:
          "P1",
        title:
          "산불 확산",
        content:
          "동쪽 확산 확인",
      });

    const sent =
      engine.markReportSent(
        report.reportId,
      );

    assert.equal(
      sent!.status,
      "SENT",
    );

    assert.equal(
      engine
        .pendingReports()
        .length,
      0,
    );
  },
);

test(
  "지령 수신확인과 미확인자를 추적한다",
  () => {
    const engine =
      new FieldOperationsEngine();

    const command =
      engine.createCommand({
        eventId:
          "EVENT-03",

        senderId:
          "COMMAND",

        senderName:
          "현장지휘",

        priority:
          "P0",

        title:
          "대피 지령",

        instruction:
          "서쪽 안전지대로 이동",

        recipientIds: [
          "FIELD-A",
          "FIELD-B",
        ],
      });

    const first =
      engine.acknowledgeCommand(
        command.commandId,
        "FIELD-A",
      );

    assert.equal(
      first!.acknowledged,
      1,
    );

    assert.equal(
      first!.successRatePct,
      50,
    );

    assert.deepEqual(
      first!
        .missingRecipientIds,
      [
        "FIELD-B",
      ],
    );

    const second =
      engine.acknowledgeCommand(
        command.commandId,
        "FIELD-B",
      );

    assert.equal(
      second!.acknowledged,
      2,
    );

    assert.equal(
      second!.successRatePct,
      100,
    );

    assert.deepEqual(
      second!
        .missingRecipientIds,
      [],
    );
  },
);

test(
  "지령 대상이 아닌 클라이언트 ACK는 거부한다",
  () => {
    const engine =
      new FieldOperationsEngine();

    const command =
      engine.createCommand({
        eventId:
          "EVENT-04",
        senderId:
          "COMMAND",
        senderName:
          "지휘소",
        priority:
          "P1",
        title:
          "이동 지령",
        instruction:
          "집결지 이동",
        recipientIds: [
          "FIELD-A",
        ],
      });

    assert.throws(
      () =>
        engine
          .acknowledgeCommand(
            command.commandId,
            "OTHER",
          ),
      /CLIENT_NOT_RECIPIENT/,
    );
  },
);
