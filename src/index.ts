import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import { app } from "./app.js";
import { config } from "./config.js";

const wss = new WebSocketServer({
  noServer: true
});

serve(
  {
    fetch: app.fetch,
    hostname: config.host,
    port: config.port,
    websocket: {
      server: wss
    }
  },
  (info) => {
    console.log(
      `forest-core-server listening on http://${config.host}:${info.port}`
    );
  }
);
