import {
  firelineApproachEngine,
  type FirelineApproachEngine,
  type FirelineApproachEvent,
  type FirelinePosition,
} from "./fireline.js";

import {
  requirementKpiEngine,
  type RequirementKpiEngine,
} from "../kpi/engine.js";

export type FirelineDeliveryResult = {
  deliveryId: string;
  sentAt: string;

  recipients: number;
  acknowledged: number;

  successRatePct:
    number | null;
};

export type FirelineAlertDeliverer =
  (
    event:
      FirelineApproachEvent,
  ) =>
    Promise<
      FirelineDeliveryResult
    >;

function timeoutMs() {
  const parsed =
    Number.parseInt(
      process.env
        .FIRELINE_DELIVERY_TIMEOUT_MS ??
        "",
      10,
    );

  return Number.isFinite(
    parsed,
  ) &&
    parsed > 0
    ? parsed
    : 1500;
}

export const deliverFieldLinkAlert:
  FirelineAlertDeliverer =
  async (event) => {
    const baseUrl =
      process.env
        .FIELDLINK_BASE_URL
        ?.trim() ||
      "http://127.0.0.1:18080";

    const pin =
      process.env
        .FIELDLINK_PIN
        ?.trim() ||
      "";

    const response =
      await fetch(
        `${baseUrl.replace(/\/+$/, "")}/api/v1/alerts`,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            ...(pin
              ? {
                  "X-FieldLink-PIN":
                    pin,
                }
              : {}),
          },

          body:
            JSON.stringify({
              sourceAlertId:
                event.sourceAlertId,

              severity:
                event.severity,

              title:
                event.title,

              message:
                event.message,

              location:
                event.location,

              source:
                "FIRELINE_ENGINE",
            }),

          signal:
            AbortSignal.timeout(
              timeoutMs(),
            ),
        },
      );

    const payload =
      await response
        .json()
        .catch(
          () => null,
        ) as
          | Record<
              string,
              unknown
            >
          | null;

    if (
      !response.ok ||
      !payload
    ) {
      throw new Error(
        `FIELDLINK_ALERT_HTTP_${response.status}`,
      );
    }

    return {
      deliveryId:
        String(
          payload.deliveryId ??
          "",
        ),

      sentAt:
        String(
          payload.sentAt ??
          new Date()
            .toISOString(),
        ),

      recipients:
        Number(
          payload.recipients ??
          0,
        ),

      acknowledged:
        Number(
          payload.acknowledged ??
          0,
        ),

      successRatePct:
        payload.successRatePct ==
        null
          ? null
          : Number(
              payload.successRatePct,
            ),
    };
  };

export class FirelineAlertCoordinator {
  constructor(
    private readonly engine:
      FirelineApproachEngine =
        firelineApproachEngine,

    private readonly options:
      {
        kpi?:
          RequirementKpiEngine;

        deliverAlert?:
          FirelineAlertDeliverer;
      } = {},
  ) {}

  async handlePosition(
    position:
      FirelinePosition,
  ) {
    const events =
      this.engine.evaluate(
        position,
      );

    const kpi =
      this.options.kpi ??
      requirementKpiEngine;

    const deliverAlert =
      this.options
        .deliverAlert ??
      deliverFieldLinkAlert;

    const results:
      Array<{
        event:
          FirelineApproachEvent;

        status:
          "DELIVERED" |
          "FAILED";

        delivery:
          FirelineDeliveryResult |
          null;

        error:
          string | null;
      }> = [];

    for (
      const event of
      events
    ) {
      const sessionIds =
        kpi.activeSessions()
          .map(
            (row) =>
              row.sessionId,
          );

      for (
        const sessionId of
        sessionIds
      ) {
        kpi.recordShareAttempt(
          sessionId,
          {
            messageId:
              event
                .sourceAlertId,

            kind:
              "FIRELINE_APPROACH",

            attemptedAt:
              event.detectedAt,
          },
        );
      }

      try {
        const delivery =
          await deliverAlert(
            event,
          );

        for (
          const sessionId of
          sessionIds
        ) {
          kpi.recordShareResult(
            sessionId,

            event
              .sourceAlertId,

            {
              deliveredAt:
                delivery
                  .sentAt,
            },
          );
        }

        results.push({
          event,
          status:
            "DELIVERED",
          delivery,
          error:
            null,
        });
      } catch (error) {
        results.push({
          event,
          status:
            "FAILED",
          delivery:
            null,

          error:
            error instanceof Error
              ? error.message
              : String(
                  error,
                ),
        });
      }
    }

    return results;
  }
}

export const firelineAlertCoordinator =
  new FirelineAlertCoordinator();
