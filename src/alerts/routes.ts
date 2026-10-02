import {
  Hono,
} from "hono";

import {
  firelineApproachEngine,
} from "./fireline.js";

import {
  firelineAlertCoordinator,
} from "./fireline-coordinator.js";

async function bodyOf(
  c: any,
) {
  const body =
    await c.req
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
      "JSON request body required",
    );
  }

  return body as
    Record<
      string,
      unknown
    >;
}

function fail(
  c: any,
  error: unknown,
) {
  return c.json(
    {
      error: {
        code:
          "FIRELINE_ALERT_ERROR",

        message:
          error instanceof Error
            ? error.message
            : String(error),
      },
    },
    400,
  );
}

export const internalFirelineRoutes =
  new Hono();

internalFirelineRoutes.post(
  "/firelines",
  async (c) => {
    try {
      const body =
        await bodyOf(c);

      const data =
        firelineApproachEngine
          .upsertRule({
            eventId:
              body.eventId,

            firelineId:
              body.firelineId,

            coordinates:
              body.coordinates,

            thresholdM:
              body.thresholdM,

            clearDistanceM:
              body.clearDistanceM,

            cooldownSec:
              body.cooldownSec,

            severity:
              body.severity,

            assetIds:
              body.assetIds,
          });

      return c.json(
        {
          data,
        },
        201,
      );
    } catch (error) {
      return fail(
        c,
        error,
      );
    }
  },
);

internalFirelineRoutes.get(
  "/firelines",
  (c) =>
    c.json({
      data:
        firelineApproachEngine
          .listRules(),
    }),
);

internalFirelineRoutes.get(
  "/firelines/status",
  (c) =>
    c.json({
      data:
        firelineApproachEngine
          .status(),
    }),
);

internalFirelineRoutes.delete(
  "/firelines/:firelineId",
  (c) => {
    const removed =
      firelineApproachEngine
        .removeRule(
          c.req.param(
            "firelineId",
          ),
        );

    return c.json({
      data: {
        removed,
      },
    });
  },
);

internalFirelineRoutes.post(
  "/firelines/evaluate",
  async (c) => {
    try {
      const body =
        await bodyOf(c);

      const data =
        await firelineAlertCoordinator
          .handlePosition({
            assetId:
              String(
                body.assetId ??
                "",
              ),

            resourceType:
              body.resourceType ==
              null
                ? undefined
                : String(
                    body
                      .resourceType,
                  ),

            eventId:
              body.eventId ==
              null
                ? undefined
                : String(
                    body.eventId,
                  ),

            longitude:
              Number(
                body.longitude,
              ),

            latitude:
              Number(
                body.latitude,
              ),

            observedAt:
              String(
                body.observedAt ??
                new Date()
                  .toISOString(),
              ),
          });

      return c.json({
        data,
      });
    } catch (error) {
      return fail(
        c,
        error,
      );
    }
  },
);
