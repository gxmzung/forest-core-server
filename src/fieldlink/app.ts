import { Hono } from "hono";
import { cors } from "hono/cors";

import {
  FieldLinkStore,
} from "./store.js";

type Options = {
  pin?: string;
  store?: FieldLinkStore;
};

function numericLimit(
  value:
    string | undefined,
  fallback: number,
) {
  const parsed =
    Number.parseInt(
      value ?? "",
      10,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : fallback;
}

async function jsonBody(
  request: {
    json:
      () =>
        Promise<unknown>;
  },
) {
  const body =
    await request
      .json()
      .catch(
        () => null,
      );

  if (
    !body ||
    typeof body !==
      "object" ||
    Array.isArray(
      body,
    )
  ) {
    throw new Error(
      "INVALID_JSON_BODY",
    );
  }

  return body as
    Record<
      string,
      unknown
    >;
}

export function createFieldLinkApp(
  options:
    Options = {},
) {
  const store =
    options.store ??
    new FieldLinkStore();

  const requiredPin =
    options.pin ??
    process.env
      .FIELDLINK_PIN
      ?.trim() ??
    "";

  const app =
    new Hono();

  app.use(
    "*",
    cors({
      origin:
        "*",

      allowMethods: [
        "GET",
        "POST",
        "OPTIONS",
      ],

      allowHeaders: [
        "Content-Type",
        "X-FieldLink-PIN",
      ],

      maxAge:
        600,
    }),
  );

  app.get(
    "/health",
    (c) =>
      c.json({
        service:
          "fieldlink-lan-messenger",

        status:
          "ok",

        mode:
          "LAN_ONLY",

        backhaulRequired:
          false,
      }),
  );

  app.use(
    "/api/v1/*",
    async (
      c,
      next,
    ) => {
      if (
        requiredPin &&
        c.req.header(
          "X-FieldLink-PIN",
        ) !==
          requiredPin
      ) {
        return c.json(
          {
            error:
              "FIELDLINK_UNAUTHORIZED",
          },
          401,
        );
      }

      await next();
    },
  );

  app.post(
    "/api/v1/presence",
    async (c) => {
      try {
        const body =
          await jsonBody(
            c.req,
          );

        return c.json(
          store
            .registerPresence({
              clientId:
                body.clientId,

              displayName:
                body.displayName,
            }),
        );
      } catch (
        error
      ) {
        return c.json(
          {
            error:
              error instanceof
              Error
                ? error.message
                : "PRESENCE_ERROR",
          },
          400,
        );
      }
    },
  );

  app.get(
    "/api/v1/presence/summary",
    (c) =>
      c.json(
        store
          .presenceSummary(),
      ),
  );

  app.get(
    "/api/v1/chat/messages",
    async (c) => {
      try {
        const messages =
          await store
            .listMessages(
              c.req.query(
                "roomId",
              ),
              {
                after:
                  c.req.query(
                    "after",
                  ),

                limit:
                  numericLimit(
                    c.req.query(
                      "limit",
                    ),
                    100,
                  ),
              },
            );

        return c.json({
          messages,
        });
      } catch (
        error
      ) {
        return c.json(
          {
            error:
              error instanceof
              Error
                ? error.message
                : "CHAT_READ_ERROR",
          },
          400,
        );
      }
    },
  );

  app.post(
    "/api/v1/chat/messages",
    async (c) => {
      try {
        const body =
          await jsonBody(
            c.req,
          );

        const message =
          await store
            .postMessage({
              roomId:
                body.roomId,

              senderId:
                body.senderId,

              senderName:
                body.senderName,

              text:
                body.text,

              clientMessageId:
                body
                  .clientMessageId,
            });

        return c.json(
          message,
          201,
        );
      } catch (
        error
      ) {
        return c.json(
          {
            error:
              error instanceof
              Error
                ? error.message
                : "CHAT_WRITE_ERROR",
          },
          400,
        );
      }
    },
  );

  app.get(
    "/api/v1/alerts/summary",
    async (c) =>
      c.json(
        await store
          .alertSummary(),
      ),
  );

  app.get(
    "/api/v1/alerts",
    async (c) => {
      const alerts =
        await store
          .listAlerts({
            after:
              c.req.query(
                "after",
              ),

            limit:
              numericLimit(
                c.req.query(
                  "limit",
                ),
                30,
              ),
          });

      return c.json({
        alerts,
      });
    },
  );

  app.post(
    "/api/v1/alerts",
    async (c) => {
      try {
        const body =
          await jsonBody(
            c.req,
          );

        const alert =
          await store
            .createAlert({
              sourceAlertId:
                body
                  .sourceAlertId,

              severity:
                body.severity,

              title:
                body.title,

              message:
                body.message,

              location:
                body.location,

              source:
                body.source,
            });

        return c.json(
          alert,
          201,
        );
      } catch (
        error
      ) {
        return c.json(
          {
            error:
              error instanceof
              Error
                ? error.message
                : "ALERT_WRITE_ERROR",
          },
          400,
        );
      }
    },
  );

  app.post(
    "/api/v1/alerts/:deliveryId/ack",
    async (c) => {
      try {
        const body =
          await jsonBody(
            c.req,
          );

        const alert =
          await store
            .acknowledgeAlert(
              c.req.param(
                "deliveryId",
              ),
              {
                clientId:
                  body.clientId,

                displayName:
                  body
                    .displayName,
              },
            );

        if (
          !alert
        ) {
          return c.json(
            {
              error:
                "ALERT_NOT_FOUND",
            },
            404,
          );
        }

        return c.json(
          alert,
        );
      } catch (
        error
      ) {
        return c.json(
          {
            error:
              error instanceof
              Error
                ? error.message
                : "ALERT_ACK_ERROR",
          },
          400,
        );
      }
    },
  );

  app.notFound(
    (c) =>
      c.json(
        {
          error:
            "FIELDLINK_NOT_FOUND",
        },
        404,
      ),
  );

  return app;
}
