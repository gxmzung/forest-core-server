import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createFieldLinkApp,
} from "../src/fieldlink/app.js";

import {
  FieldLinkStore,
} from "../src/fieldlink/store.js";

import {
  FieldOperationsEngine,
} from "../src/operations/field-operations.js";

async function fixture() {
  const directory =
    await mkdtemp(
      path.join(
        os.tmpdir(),
        "field-ops-api-",
      ),
    );

  const store =
    new FieldLinkStore(
      path.join(
        directory,
        "fieldlink.json",
      ),
    );

  const operationsEngine =
    new FieldOperationsEngine();

  const app =
    createFieldLinkApp({
      pin:
        "2468",

      store,

      operationsEngine,
    });

  return {
    app,
    directory,
    operationsEngine,
  };
}

function headers() {
  return {
    "Content-Type":
      "application/json",

    "X-FieldLink-PIN":
      "2468",
  };
}

test(
  "상황보고 API는 P0부터 우선 조회한다",
  async () => {
    const {
      app,
      directory,
    } =
      await fixture();

    try {
      for (
        const priority of
        ["P3", "P0"]
      ) {
        const response =
          await app.request(
            "/api/v1/operations/reports",
            {
              method:
                "POST",

              headers:
                headers(),

              body:
                JSON.stringify({
                  eventId:
                    "EVENT-OPS",

                  authorId:
                    "FIELD-01",

                  authorName:
                    "현장대원",

                  priority,

                  title:
                    priority +
                    " 상황",

                  content:
                    "현장 상황보고",
                }),
            },
          );

        assert.equal(
          response.status,
          201,
        );
      }

      const response =
        await app.request(
          "/api/v1/operations/reports/pending",
          {
            headers: {
              "X-FieldLink-PIN":
                "2468",
            },
          },
        );

      assert.equal(
        response.status,
        200,
      );

      const payload =
        await response.json();

      assert.equal(
        payload.reports
          .length,
        2,
      );

      assert.equal(
        payload.reports[0]
          .priority,
        "P0",
      );

      assert.equal(
        payload.reports[1]
          .priority,
        "P3",
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

test(
  "상황보고 전송 완료 API가 대기열에서 제거한다",
  async () => {
    const {
      app,
      directory,
    } =
      await fixture();

    try {
      const created =
        await app.request(
          "/api/v1/operations/reports",
          {
            method:
              "POST",

            headers:
              headers(),

            body:
              JSON.stringify({
                eventId:
                  "EVENT-SENT",

                authorId:
                  "FIELD-01",

                authorName:
                  "현장대원",

                priority:
                  "P1",

                title:
                  "확산 상황",

                content:
                  "동쪽 확산",
              }),
          },
        );

      const report =
        await created.json();

      const sent =
        await app.request(
          "/api/v1/operations/reports/" +
            report.reportId +
            "/sent",
          {
            method:
              "POST",

            headers:
              headers(),
          },
        );

      assert.equal(
        sent.status,
        200,
      );

      const pending =
        await app.request(
          "/api/v1/operations/reports/pending",
          {
            headers: {
              "X-FieldLink-PIN":
                "2468",
            },
          },
        );

      const payload =
        await pending.json();

      assert.equal(
        payload.reports
          .length,
        0,
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

test(
  "지령 API는 ACK와 미확인자를 추적한다",
  async () => {
    const {
      app,
      directory,
    } =
      await fixture();

    try {
      const created =
        await app.request(
          "/api/v1/operations/commands",
          {
            method:
              "POST",

            headers:
              headers(),

            body:
              JSON.stringify({
                eventId:
                  "EVENT-CMD",

                senderId:
                  "COMMAND",

                senderName:
                  "지휘소",

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
              }),
          },
        );

      assert.equal(
        created.status,
        201,
      );

      const command =
        await created.json();

      const firstAck =
        await app.request(
          "/api/v1/operations/commands/" +
            command.commandId +
            "/ack",
          {
            method:
              "POST",

            headers:
              headers(),

            body:
              JSON.stringify({
                clientId:
                  "FIELD-A",
              }),
          },
        );

      const first =
        await firstAck.json();

      assert.equal(
        first.acknowledged,
        1,
      );

      assert.equal(
        first.successRatePct,
        50,
      );

      assert.deepEqual(
        first.missingRecipientIds,
        [
          "FIELD-B",
        ],
      );

      const secondAck =
        await app.request(
          "/api/v1/operations/commands/" +
            command.commandId +
            "/ack",
          {
            method:
              "POST",

            headers:
              headers(),

            body:
              JSON.stringify({
                clientId:
                  "FIELD-B",
              }),
          },
        );

      const second =
        await secondAck.json();

      assert.equal(
        second.successRatePct,
        100,
      );

      assert.deepEqual(
        second.missingRecipientIds,
        [],
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

test(
  "지령 대상이 아닌 사용자의 ACK API를 거부한다",
  async () => {
    const {
      app,
      directory,
    } =
      await fixture();

    try {
      const created =
        await app.request(
          "/api/v1/operations/commands",
          {
            method:
              "POST",

            headers:
              headers(),

            body:
              JSON.stringify({
                eventId:
                  "EVENT-CMD-2",

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
              }),
          },
        );

      const command =
        await created.json();

      const response =
        await app.request(
          "/api/v1/operations/commands/" +
            command.commandId +
            "/ack",
          {
            method:
              "POST",

            headers:
              headers(),

            body:
              JSON.stringify({
                clientId:
                  "OTHER",
              }),
          },
        );

      assert.equal(
        response.status,
        400,
      );

      const payload =
        await response.json();

      assert.equal(
        payload.error,
        "CLIENT_NOT_RECIPIENT",
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
