import {
  Hono,
} from "hono";

import {
  requirementKpiEngine,
  type NetworkState,
} from "./engine.js";

async function bodyOf(
  c: any,
) {
  try {
    return await c.req.json();
  } catch {
    throw new Error(
      "JSON request body required",
    );
  }
}

function errorResponse(
  c: any,
  error: unknown,
) {
  return c.json(
    {
      error: {
        code:
          "INVALID_KPI_REQUEST",

        message:
          error instanceof Error
            ? error.message
            : String(error),
      },
    },
    400,
  );
}

export const internalKpiRoutes =
  new Hono();

internalKpiRoutes.post(
  "/sessions",
  async (c) => {
    try {
      const body =
        await bodyOf(c);

      const data =
        requirementKpiEngine
          .startSession({
            sessionId:
              String(
                body.sessionId ??
                "",
              ),

            eventId:
              String(
                body.eventId ??
                "",
              ),

            startedAt:
              body.startedAt,

            initialNetworkState:
              body.initialNetworkState,

            expectedUpdateIntervalSec:
              body.expectedUpdateIntervalSec,

            updateTargetSec:
              body.updateTargetSec,

            availabilityTargetPct:
              body.availabilityTargetPct,

            sharingTargetPct:
              body.sharingTargetPct,

            deploymentTargetMinutes:
              body.deploymentTargetMinutes,
          });

      return c.json(
        {
          data,
        },
        201,
      );
    } catch (error) {
      return errorResponse(
        c,
        error,
      );
    }
  },
);

internalKpiRoutes.post(
  "/sessions/:sessionId/network-state",
  async (c) => {
    try {
      const body =
        await bodyOf(c);

      const data =
        requirementKpiEngine
          .recordNetworkState(
            c.req.param(
              "sessionId",
            ),

            String(
              body.state ??
              "",
            ) as NetworkState,

            body.at,
          );

      return c.json({
        data,
      });
    } catch (error) {
      return errorResponse(
        c,
        error,
      );
    }
  },
);

internalKpiRoutes.post(
  "/sessions/:sessionId/location-update",
  async (c) => {
    try {
      const body =
        await bodyOf(c);

      const data =
        requirementKpiEngine
          .recordLocationUpdate(
            c.req.param(
              "sessionId",
            ),
            {
              assetId:
                String(
                  body.assetId ??
                  "",
                ),

              observedAt:
                String(
                  body.observedAt ??
                  "",
                ),

              receivedAt:
                String(
                  body.receivedAt ??
                  "",
                ),
            },
          );

      return c.json({
        data,
      });
    } catch (error) {
      return errorResponse(
        c,
        error,
      );
    }
  },
);

internalKpiRoutes.post(
  "/sessions/:sessionId/shares",
  async (c) => {
    try {
      const body =
        await bodyOf(c);

      const data =
        requirementKpiEngine
          .recordShareAttempt(
            c.req.param(
              "sessionId",
            ),
            {
              messageId:
                String(
                  body.messageId ??
                  "",
                ),

              kind:
                body.kind,

              attemptedAt:
                body.attemptedAt,
            },
          );

      return c.json(
        {
          data,
        },
        201,
      );
    } catch (error) {
      return errorResponse(
        c,
        error,
      );
    }
  },
);

internalKpiRoutes.patch(
  "/sessions/:sessionId/shares/:messageId",
  async (c) => {
    try {
      const body =
        await bodyOf(c);

      const data =
        requirementKpiEngine
          .recordShareResult(
            c.req.param(
              "sessionId",
            ),

            c.req.param(
              "messageId",
            ),

            {
              deliveredAt:
                body.deliveredAt,

              acknowledgedAt:
                body.acknowledgedAt,
            },
          );

      return c.json({
        data,
      });
    } catch (error) {
      return errorResponse(
        c,
        error,
      );
    }
  },
);

internalKpiRoutes.post(
  "/sessions/:sessionId/stop",
  async (c) => {
    try {
      const body =
        await bodyOf(c);

      const sessionId =
        c.req.param(
          "sessionId",
        );

      requirementKpiEngine
        .stopSession(
          sessionId,
          body.stoppedAt,
        );

      return c.json({
        data:
          requirementKpiEngine
            .snapshot(
              sessionId,
            ),
      });
    } catch (error) {
      return errorResponse(
        c,
        error,
      );
    }
  },
);

internalKpiRoutes.get(
  "/sessions/:sessionId",
  (c) => {
    try {
      return c.json({
        data:
          requirementKpiEngine
            .snapshot(
              c.req.param(
                "sessionId",
              ),

              c.req.query(
                "at",
              ) ||
                new Date()
                  .toISOString(),
            ),
      });
    } catch (error) {
      return errorResponse(
        c,
        error,
      );
    }
  },
);

internalKpiRoutes.get(
  "/sessions",
  (c) =>
    c.json({
      data:
        requirementKpiEngine
          .activeSessions(),
    }),
);

export const dashboardKpiRoutes =
  new Hono();

dashboardKpiRoutes.get(
  "/sessions/:sessionId",
  (c) => {
    try {
      return c.json({
        data:
          requirementKpiEngine
            .snapshot(
              c.req.param(
                "sessionId",
              ),

              c.req.query(
                "at",
              ) ||
                new Date()
                  .toISOString(),
            ),
      });
    } catch (error) {
      return c.json(
        {
          error: {
            code:
              "KPI_NOT_FOUND",

            message:
              error instanceof Error
                ? error.message
                : String(
                    error,
                  ),
          },
        },
        404,
      );
    }
  },
);
