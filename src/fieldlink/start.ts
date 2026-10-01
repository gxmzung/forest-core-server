import { serve } from "@hono/node-server";

import {
  createFieldLinkApp,
} from "./app.js";

import {
  FieldLinkStore,
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

const store =
  new FieldLinkStore(
    dataFile,
  );

const app =
  createFieldLinkApp({
    store,
  });

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
  },
);
