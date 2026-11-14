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

async function fixture() {
  const directory =
    await mkdtemp(
      path.join(
        os.tmpdir(),
        "fieldlink-test-",
      ),
    );

  const file =
    path.join(
      directory,
      "state.json",
    );

  const store =
    new FieldLinkStore(
      file,
    );

  const app =
    createFieldLinkApp({
      pin:
        "2468",

      store,
    });

  return {
    app,
    file,
    directory,
    store,
  };
}

function authHeaders() {
  return {
    "Content-Type":
      "application/json",

    "X-FieldLink-PIN":
      "2468",
  };
}

test(
  "FieldLink health is LAN-only and does not require backhaul",
  async () => {
    const {
      app,
      directory,
    } =
      await fixture();

    try {
      const response =
        await app.request(
          "/health",
        );

      assert.equal(
        response.status,
        200,
      );

      const payload =
        await response
          .json();

      assert.equal(
        payload.mode,
        "LAN_ONLY",
      );

      assert.equal(
        payload.backhaulRequired,
        false,
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
  "FieldLink API rejects wrong PIN",
  async () => {
    const {
      app,
      directory,
    } =
      await fixture();

    try {
      const response =
        await app.request(
          "/api/v1/chat/messages?roomId=test",
        );

      assert.equal(
        response.status,
        401,
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
  "LAN chat posts and reads messages",
  async () => {
    const {
      app,
      directory,
    } =
      await fixture();

    try {
      const sent =
        await app.request(
          "/api/v1/chat/messages",
          {
            method:
              "POST",

            headers:
              authHeaders(),

            body:
              JSON.stringify({
                roomId:
                  "field-room",

                senderId:
                  "client-a",

                senderName:
                  "GCS Station",

                text:
                  "현장 통신 확인",

                clientMessageId:
                  "msg-1",
              }),
          },
        );

      assert.equal(
        sent.status,
        201,
      );

      const listed =
        await app.request(
          "/api/v1/chat/messages?roomId=field-room",
          {
            headers: {
              "X-FieldLink-PIN":
                "2468",
            },
          },
        );

      const payload =
        await listed
          .json();

      assert.equal(
        payload.messages
          .length,
        1,
      );

      assert.equal(
        payload.messages[0]
          .text,
        "현장 통신 확인",
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
  "same clientMessageId is idempotent",
  async () => {
    const {
      store,
      directory,
    } =
      await fixture();

    try {
      const first =
        await store
          .postMessage({
            roomId:
              "field-room",

            senderId:
              "client-a",

            senderName:
              "A",

            text:
              "hello",

            clientMessageId:
              "same-id",
          });

      const second =
        await store
          .postMessage({
            roomId:
              "field-room",

            senderId:
              "client-a",

            senderName:
              "A",

            text:
              "hello",

            clientMessageId:
              "same-id",
          });

      assert.equal(
        first.messageId,
        second.messageId,
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
  "alert delivery counts active LAN recipients and ACK",
  async () => {
    const {
      app,
      directory,
    } =
      await fixture();

    try {
      for (
        const clientId of
        [
          "client-a",
          "client-b",
        ]
      ) {
        const presence =
          await app.request(
            "/api/v1/presence",
            {
              method:
                "POST",

              headers:
                authHeaders(),

              body:
                JSON.stringify({
                  clientId,

                  displayName:
                    clientId,
                }),
            },
          );

        assert.equal(
          presence.status,
          200,
        );
      }

      const sent =
        await app.request(
          "/api/v1/alerts",
          {
            method:
              "POST",

            headers:
              authHeaders(),

            body:
              JSON.stringify({
                sourceAlertId:
                  "ALT-TEST",

                severity:
                  "CRITICAL",

                title:
                  "화선 접근",

                message:
                  "위험구역 접근",

                source:
                  "INTEGRATED_COMMAND",
              }),
          },
        );

      const alert =
        await sent.json();

      assert.equal(
        alert.recipients,
        2,
      );

      assert.equal(
        alert.acknowledged,
        0,
      );

      const ack =
        await app.request(
          `/api/v1/alerts/${alert.deliveryId}/ack`,
          {
            method:
              "POST",

            headers:
              authHeaders(),

            body:
              JSON.stringify({
                clientId:
                  "client-a",

                displayName:
                  "client-a",
              }),
          },
        );

      const acknowledged =
        await ack.json();

      assert.equal(
        acknowledged
          .acknowledged,
        1,
      );

      assert.equal(
        acknowledged
          .successRatePct,
        50,
      );

      const summary =
        await app.request(
          "/api/v1/alerts/summary",
          {
            headers: {
              "X-FieldLink-PIN":
                "2468",
            },
          },
        );

      const summaryPayload =
        await summary
          .json();

      assert.equal(
        summaryPayload
          .delivered,
        2,
      );

      assert.equal(
        summaryPayload
          .acknowledged,
        1,
      );

      assert.equal(
        summaryPayload
          .successRatePct,
        50,
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
  "chat survives service restart through local file",
  async () => {
    const {
      file,
      directory,
      store,
    } =
      await fixture();

    try {
      await store
        .postMessage({
          roomId:
            "persist-room",

          senderId:
            "client-a",

          senderName:
            "A",

          text:
            "persist",

          clientMessageId:
            "persist-1",
        });

      const reloaded =
        new FieldLinkStore(
          file,
        );

      const messages =
        await reloaded
          .listMessages(
            "persist-room",
          );

      assert.equal(
        messages.length,
        1,
      );

      assert.equal(
        messages[0]
          ?.text,
        "persist",
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
