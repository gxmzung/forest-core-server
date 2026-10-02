import assert from "node:assert/strict";
import test from "node:test";

process.env.DB_MODE = "sqlite";

test(
  "HTTP DELIVER exposes live Sleno RTK marker while DB persistence is stalled",
  async () => {
    const { Hono } = await import("hono");

    const {
      supabase,
    } = await import(
      "../src/db/client.js"
    );

    const {
      clearLiveSlenoRows,
      readLiveSlenoRows,
    } = await import(
      "../src/device/live-sleno.js"
    );

    let persistenceReadStarted =
      false;

    /*
     * vendor-messages POST가 DB persistence 단계에서
     * 멈춘 상황을 재현한다.
     *
     * live cache는 DB await 전에 기록되어야 한다.
     */
    const query = {
      select() {
        return query;
      },

      eq() {
        return query;
      },

      maybeSingle() {
        persistenceReadStarted =
          true;

        return new Promise(
          () => {},
        );
      },

      order() {
        return query;
      },

      limit() {
        return Promise.resolve({
          data: [],
          error: null,
        });
      },

      insert() {
        return Promise.resolve({
          error: null,
        });
      },
    };

    Object.assign(
      supabase as unknown as
        Record<string, unknown>,
      {
        schema: () => ({
          from: () => query,
        }),
      },
    );

    const {
      deviceRoutes,
    } = await import(
      "../src/device/routes.js"
    );

    const {
      dashboardRoutes,
    } = await import(
      "../src/dashboard/routes.js"
    );

    clearLiveSlenoRows();

    const app = new Hono();

    app.route(
      "/internal/v1",
      deviceRoutes,
    );

    app.route(
      "/api/v1/dashboard",
      dashboardRoutes,
    );

    const eventId =
      "demo-wildfire-deoksungsan";

    const occurredAt =
      new Date().toISOString();

    /*
     * 실제 Core 내부 API와 같은 HTTP 요청.
     * DB가 의도적으로 멈춰 있으므로 await 하지 않는다.
     */
    void app.request(
      "http://localhost/internal/v1/vendor-messages",
      {
        method: "POST",

        headers: {
          "content-type":
            "application/json",
        },

        body: JSON.stringify({
          vendor: "JININFRA",

          mode: "DELIVER",

          normalized: true,

          mappings: [
            {
              vendorDeviceId:
                "SIM-RTK-01",

              assetId:
                "20000000-0000-4000-8000-000000000004",

              mapped: true,
              assetExists: true,
              mappingStatus:
                "ACTIVE",
            },

            {
              vendorDeviceId:
                "SIM-RTK-BASE-01",

              assetId:
                "20000000-0000-4000-8000-000000000009",

              mapped: true,
              assetExists: true,
              mappingStatus:
                "ACTIVE",
            },
          ],

          request: {
            payloadType:
              "RTK_POSITION",

            context: {
              eventExternalId:
                "RTK-router-http-integration-test",

              sourceSystem:
                "sleno-server",

              occurredAt,

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

                medium: "LPWA",

                evidenceType:
                  "OBSERVED",

                status: "ACTIVE",

                observations: [
                  {
                    receivedAt:
                      occurredAt,

                    rssiDbm: -66,
                    snrDb: 15,
                    selected: true,
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
                44030,

              latitude:
                37.42381743,

              longitude:
                126.88739393,

              altitude: 88.8,

              fixType: "DGPS",
            },
          },
        }),
      },
    );

    /*
     * POST가 live cache를 기록하고,
     * DB persistence에서 실제로 멈춘 상태까지 기다린다.
     */
    for (
      let attempt = 0;
      attempt < 50;
      attempt += 1
    ) {
      if (
        persistenceReadStarted &&
        readLiveSlenoRows()
          .length > 0
      ) {
        break;
      }

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            10,
          ),
      );
    }

    assert.equal(
      persistenceReadStarted,
      true,
      "POST가 DB persistence 단계까지 진입해야 합니다.",
    );

    assert.equal(
      readLiveSlenoRows().length,
      1,
      "DB 완료 전 live RTK cache가 생성되어야 합니다.",
    );

    /*
     * DB가 멈춰 있어도 dashboard API는
     * live cache를 이용해 즉시 반환해야 한다.
     */
    const startedAt =
      performance.now();

    const response =
      await app.request(
        `http://localhost/api/v1/dashboard/telemetry/drones?eventId=${eventId}`,
      );

    const elapsedMs =
      performance.now() -
      startedAt;

    assert.equal(
      response.status,
      200,
    );

    const body =
      await response.json() as {
        data: Array<
          Record<
            string,
            unknown
          >
        >;
      };

    const marker =
      body.data.find(
        (row) =>
          row.assetType ===
          "RTK_TERMINAL",
      );

    assert.ok(
      marker,
      "RTK_TERMINAL marker가 반환되어야 합니다.",
    );

    assert.equal(
      marker.assetId,
      "20000000-0000-4000-8000-000000000004",
    );

    assert.equal(
      marker.latitude,
      37.42381743,
    );

    assert.equal(
      marker.longitude,
      126.88739393,
    );

    assert.equal(
      marker.operationalStatus,
      "ACTIVE",
    );

    const attributes =
      marker.attributes as
        Record<
          string,
          unknown
        >;

    assert.equal(
      attributes
        .persistenceStatus,
      "LIVE_UNPERSISTED",
    );

    /*
     * DB timeout 1.2초를 기다린 결과가 아니라
     * live cache에서 즉시 반환됐는지 확인.
     */
    assert.ok(
      elapsedMs < 500,
      `dashboard response too slow: ${elapsedMs.toFixed(1)}ms`,
    );

    clearLiveSlenoRows();

    delete (
      supabase as unknown as
        Record<
          string,
          unknown
        >
    ).schema;
  },
);
