import { serve } from "@hono/node-server";

import {
  createFieldLinkApp,
} from "./app.js";

import {
  FieldLinkStore,
  type FieldLinkDeliveredAlert,
} from "./store.js";

function numberValue(
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

const host =
  process.env
    .FIELDLINK_HOST
    ?.trim() ||
  "0.0.0.0";

const port =
  numberValue(
    process.env
      .FIELDLINK_PORT,
    18080,
  );

const dataFile =
  process.env
    .FIELDLINK_DATA_FILE
    ?.trim() ||
  "./data/fieldlink-state.json";

const kpiAckCallbackUrl =
  process.env
    .FIELDLINK_KPI_ACK_CALLBACK_URL
    ?.trim() ||
  "";

const store =
  new FieldLinkStore(
    dataFile,
  );

async function notifyCoreKpiAck(
  alert:
    FieldLinkDeliveredAlert,
) {
  if (!kpiAckCallbackUrl) {
    return;
  }

  const response =
    await fetch(
      kpiAckCallbackUrl,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            sourceAlertId:
              alert
                .sourceAlertId,

            deliveryId:
              alert
                .deliveryId,

            acknowledgedAt:
              new Date()
                .toISOString(),

            acknowledged:
              alert
                .acknowledged,
          }),

        signal:
          AbortSignal.timeout(
            1500,
          ),
      },
    );

  if (!response.ok) {
    throw new Error(
      `CORE_KPI_ACK_HTTP_${response.status}`,
    );
  }
}

const app =
  createFieldLinkApp(
    kpiAckCallbackUrl
      ? {
          store,

          onAlertAcknowledged:
            notifyCoreKpiAck,
        }
      : {
          store,
        },
  );

serve(
  {
    fetch:
      app.fetch,

    hostname:
      host,

    port,
  },

  () => {
    console.log(
      `[FieldLink] LAN messenger listening on http://${host}:${port}`,
    );

    console.log(
      `[FieldLink] data=${dataFile}`,
    );

    console.log(
      `[FieldLink] PIN=${
        process.env
          .FIELDLINK_PIN
          ?.trim()
          ? "ENABLED"
          : "DISABLED"
      }`,
    );

    console.log(
      `[FieldLink] KPI ACK callback=${
        kpiAckCallbackUrl
          ? "ENABLED"
          : "DISABLED"
      }`,
    );
  },
);
