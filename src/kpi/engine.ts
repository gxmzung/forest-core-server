export type NetworkState =
  | "UP"
  | "DEGRADED"
  | "DOWN";

export type RequirementPass =
  | "PASS"
  | "FAIL"
  | "NO_DATA";

export type LocationUpdate = {
  assetId: string;
  observedAt: string;
  receivedAt: string;
};

export type NetworkTransition = {
  state: NetworkState;
  at: string;
};

export type ShareRecord = {
  messageId: string;
  kind: string;
  attemptedAt: string;
  deliveredAt: string | null;
  acknowledgedAt: string | null;
};

export type KpiSession = {
  sessionId: string;
  eventId: string;
  startedAt: string;
  stoppedAt: string | null;

  expectedUpdateIntervalSec: number;
  updateTargetSec: number;
  availabilityTargetPct: number;
  sharingTargetPct: number;
  deploymentTargetMinutes: number;

  networkTransitions:
    NetworkTransition[];

  updates:
    LocationUpdate[];

  shares:
    ShareRecord[];
};

function validIso(
  value: string,
) {
  return (
    typeof value === "string" &&
    Number.isFinite(
      Date.parse(value),
    )
  );
}

function requireIso(
  value: string,
  name: string,
) {
  if (!validIso(value)) {
    throw new Error(
      `${name} must be ISO-8601`,
    );
  }

  return value;
}

function requirePositive(
  value: number,
  name: string,
) {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      `${name} must be > 0`,
    );
  }

  return value;
}

function round(
  value: number,
  digits = 3,
) {
  return Number(
    value.toFixed(digits),
  );
}

function pct(
  numerator: number,
  denominator: number,
) {
  if (denominator <= 0) {
    return null;
  }

  return round(
    numerator /
      denominator *
      100,
  );
}

function p95(
  values: number[],
) {
  if (!values.length) {
    return null;
  }

  const ordered =
    [...values].sort(
      (a, b) =>
        a - b,
    );

  const index =
    Math.max(
      0,
      Math.ceil(
        ordered.length *
          0.95,
      ) - 1,
    );

  return ordered[index] ??
    null;
}

function passAtMost(
  value: number | null,
  target: number,
): RequirementPass {
  if (value == null) {
    return "NO_DATA";
  }

  return value <= target
    ? "PASS"
    : "FAIL";
}

function passAtLeast(
  value: number | null,
  target: number,
): RequirementPass {
  if (value == null) {
    return "NO_DATA";
  }

  return value >= target
    ? "PASS"
    : "FAIL";
}

function copySession(
  session: KpiSession,
): KpiSession {
  return {
    ...session,

    networkTransitions:
      session.networkTransitions
        .map(
          (row) => ({
            ...row,
          }),
        ),

    updates:
      session.updates.map(
        (row) => ({
          ...row,
        }),
      ),

    shares:
      session.shares.map(
        (row) => ({
          ...row,
        }),
      ),
  };
}

export class RequirementKpiEngine {
  private readonly sessions =
    new Map<
      string,
      KpiSession
    >();

  reset() {
    this.sessions.clear();
  }

  startSession(
    input: {
      sessionId: string;
      eventId: string;
      startedAt?: string;
      initialNetworkState?:
        NetworkState;

      expectedUpdateIntervalSec?:
        number;
      updateTargetSec?: number;
      availabilityTargetPct?:
        number;
      sharingTargetPct?:
        number;
      deploymentTargetMinutes?:
        number;
    },
  ) {
    const sessionId =
      input.sessionId.trim();

    const eventId =
      input.eventId.trim();

    if (!sessionId) {
      throw new Error(
        "sessionId is required",
      );
    }

    if (!eventId) {
      throw new Error(
        "eventId is required",
      );
    }

    if (
      this.sessions.has(
        sessionId,
      )
    ) {
      throw new Error(
        "sessionId already exists",
      );
    }

    const startedAt =
      requireIso(
        input.startedAt ??
          new Date()
            .toISOString(),
        "startedAt",
      );

    const session:
      KpiSession = {
        sessionId,
        eventId,
        startedAt,
        stoppedAt: null,

        expectedUpdateIntervalSec:
          requirePositive(
            input.expectedUpdateIntervalSec ??
              3,
            "expectedUpdateIntervalSec",
          ),

        updateTargetSec:
          requirePositive(
            input.updateTargetSec ??
              3,
            "updateTargetSec",
          ),

        availabilityTargetPct:
          requirePositive(
            input.availabilityTargetPct ??
              98,
            "availabilityTargetPct",
          ),

        sharingTargetPct:
          requirePositive(
            input.sharingTargetPct ??
              98,
            "sharingTargetPct",
          ),

        deploymentTargetMinutes:
          requirePositive(
            input.deploymentTargetMinutes ??
              7,
            "deploymentTargetMinutes",
          ),

        networkTransitions: [],
        updates: [],
        shares: [],
      };

    this.sessions.set(
      sessionId,
      session,
    );

    if (
      input.initialNetworkState
    ) {
      this.recordNetworkState(
        sessionId,
        input.initialNetworkState,
        startedAt,
      );
    }

    return copySession(
      session,
    );
  }

  stopSession(
    sessionId: string,
    stoppedAt =
      new Date()
        .toISOString(),
  ) {
    const session =
      this.requireSession(
        sessionId,
      );

    session.stoppedAt =
      requireIso(
        stoppedAt,
        "stoppedAt",
      );

    if (
      Date.parse(
        session.stoppedAt,
      ) <
      Date.parse(
        session.startedAt,
      )
    ) {
      throw new Error(
        "stoppedAt precedes startedAt",
      );
    }

    return copySession(
      session,
    );
  }

  recordNetworkState(
    sessionId: string,
    state: NetworkState,
    at =
      new Date()
        .toISOString(),
  ) {
    const session =
      this.requireActiveSession(
        sessionId,
      );

    if (
      ![
        "UP",
        "DEGRADED",
        "DOWN",
      ].includes(state)
    ) {
      throw new Error(
        "invalid network state",
      );
    }

    const normalizedAt =
      requireIso(
        at,
        "network state time",
      );

    const latest =
      [...session.networkTransitions]
        .sort(
          (a, b) =>
            Date.parse(b.at) -
            Date.parse(a.at),
        )[0];

    if (
      latest &&
      latest.state === state
    ) {
      return copySession(
        session,
      );
    }

    session.networkTransitions
      .push({
        state,
        at: normalizedAt,
      });

    session.networkTransitions
      .sort(
        (a, b) =>
          Date.parse(a.at) -
          Date.parse(b.at),
      );

    return copySession(
      session,
    );
  }

  recordLocationUpdate(
    sessionId: string,
    input: LocationUpdate,
  ) {
    const session =
      this.requireActiveSession(
        sessionId,
      );

    const assetId =
      input.assetId.trim();

    if (!assetId) {
      throw new Error(
        "assetId is required",
      );
    }

    session.updates.push({
      assetId,

      observedAt:
        requireIso(
          input.observedAt,
          "observedAt",
        ),

      receivedAt:
        requireIso(
          input.receivedAt,
          "receivedAt",
        ),
    });

    return copySession(
      session,
    );
  }

  recordLocationUpdateForActiveSessions(
    input: LocationUpdate,
  ) {
    for (
      const session of
      this.sessions.values()
    ) {
      if (
        session.stoppedAt
      ) {
        continue;
      }

      this.recordLocationUpdate(
        session.sessionId,
        input,
      );
    }
  }

  recordShareAttempt(
    sessionId: string,
    input: {
      messageId: string;
      kind?: string;
      attemptedAt?: string;
    },
  ) {
    const session =
      this.requireActiveSession(
        sessionId,
      );

    const messageId =
      input.messageId.trim();

    if (!messageId) {
      throw new Error(
        "messageId is required",
      );
    }

    const existing =
      session.shares.find(
        (row) =>
          row.messageId ===
          messageId,
      );

    if (existing) {
      return {
        ...existing,
      };
    }

    const record:
      ShareRecord = {
        messageId,

        kind:
          input.kind
            ?.trim() ||
          "UNKNOWN",

        attemptedAt:
          requireIso(
            input.attemptedAt ??
              new Date()
                .toISOString(),
            "attemptedAt",
          ),

        deliveredAt: null,
        acknowledgedAt: null,
      };

    session.shares.push(
      record,
    );

    return {
      ...record,
    };
  }

  recordShareResult(
    sessionId: string,
    messageId: string,
    input: {
      deliveredAt?: string | null;
      acknowledgedAt?: string | null;
    },
  ) {
    const session =
      this.requireActiveSession(
        sessionId,
      );

    const record =
      session.shares.find(
        (row) =>
          row.messageId ===
          messageId,
      );

    if (!record) {
      throw new Error(
        "share attempt not found",
      );
    }

    if (
      input.deliveredAt != null
    ) {
      record.deliveredAt =
        requireIso(
          input.deliveredAt,
          "deliveredAt",
        );
    }

    if (
      input.acknowledgedAt != null
    ) {
      record.acknowledgedAt =
        requireIso(
          input.acknowledgedAt,
          "acknowledgedAt",
        );

      if (
        !record.deliveredAt
      ) {
        record.deliveredAt =
          record.acknowledgedAt;
      }
    }

    return {
      ...record,
    };
  }

  activeSessions() {
    return [
      ...this.sessions.values(),
    ]
      .filter(
        (row) =>
          row.stoppedAt == null,
      )
      .map(copySession);
  }

  snapshot(
    sessionId: string,
    measuredUntil =
      new Date()
        .toISOString(),
  ) {
    const session =
      this.requireSession(
        sessionId,
      );

    const endAt =
      session.stoppedAt ??
      requireIso(
        measuredUntil,
        "measuredUntil",
      );

    const startMs =
      Date.parse(
        session.startedAt,
      );

    const endMs =
      Date.parse(
        endAt,
      );

    if (endMs < startMs) {
      throw new Error(
        "measurement end precedes start",
      );
    }

    const transitions =
      session.networkTransitions
        .filter(
          (row) =>
            Date.parse(row.at) <=
            endMs,
        )
        .sort(
          (a, b) =>
            Date.parse(a.at) -
            Date.parse(b.at),
        );

    let networkMeasuredMs = 0;
    let networkAvailableMs = 0;

    let upMs = 0;
    let degradedMs = 0;
    let downMs = 0;

    for (
      let index = 0;
      index <
      transitions.length;
      index += 1
    ) {
      const row =
        transitions[index]!;

      const next =
        transitions[
          index + 1
        ];

      const segmentStart =
        Math.max(
          startMs,
          Date.parse(
            row.at,
          ),
        );

      const segmentEnd =
        Math.min(
          endMs,
          next
            ? Date.parse(
                next.at,
              )
            : endMs,
        );

      const duration =
        Math.max(
          0,
          segmentEnd -
            segmentStart,
        );

      networkMeasuredMs +=
        duration;

      if (
        row.state !==
        "DOWN"
      ) {
        networkAvailableMs +=
          duration;
      }

      if (
        row.state === "UP"
      ) {
        upMs += duration;
      } else if (
        row.state ===
        "DEGRADED"
      ) {
        degradedMs +=
          duration;
      } else {
        downMs += duration;
      }
    }

    const availabilityPct =
      pct(
        networkAvailableMs,
        networkMeasuredMs,
      );

    const firstUp =
      transitions.find(
        (row) =>
          row.state === "UP",
      );

    const deploymentMinutes =
      firstUp
        ? round(
            (
              Date.parse(
                firstUp.at,
              ) -
              startMs
            ) /
              60_000,
          )
        : null;

    const byAsset =
      new Map<
        string,
        LocationUpdate[]
      >();

    for (
      const update of
      session.updates
    ) {
      const rows =
        byAsset.get(
          update.assetId,
        ) ?? [];

      rows.push(
        update,
      );

      byAsset.set(
        update.assetId,
        rows,
      );
    }

    const assetMetrics =
      [
        ...byAsset.entries(),
      ].map(
        ([assetId, rows]) => {
          const ordered =
            [...rows].sort(
              (a, b) =>
                Date.parse(
                  a.observedAt,
                ) -
                Date.parse(
                  b.observedAt,
                ),
            );

          const intervals:
            number[] = [];

          const latencies:
            number[] = [];

          for (
            const row of
            ordered
          ) {
            latencies.push(
              Math.max(
                0,
                (
                  Date.parse(
                    row.receivedAt,
                  ) -
                  Date.parse(
                    row.observedAt,
                  )
                ) /
                  1000,
              ),
            );
          }

          for (
            let index = 1;
            index <
            ordered.length;
            index += 1
          ) {
            intervals.push(
              Math.max(
                0,
                (
                  Date.parse(
                    ordered[index]!
                      .observedAt,
                  ) -
                  Date.parse(
                    ordered[index - 1]!.observedAt,
                  )
                ) /
                  1000,
              ),
            );
          }

          const average =
            intervals.length
              ? round(
                  intervals.reduce(
                    (
                      sum,
                      value,
                    ) =>
                      sum +
                      value,
                    0,
                  ) /
                    intervals.length,
                )
              : null;

          const maximum =
            intervals.length
              ? round(
                  Math.max(
                    ...intervals,
                  ),
                )
              : null;

          const p95Value =
            p95(
              intervals,
            );

          const latencyAvgSec =
            latencies.length
              ? round(
                  latencies.reduce(
                    (
                      sum,
                      value,
                    ) =>
                      sum +
                      value,
                    0,
                  ) /
                    latencies.length,
                )
              : null;

          return {
            assetId,

            sampleCount:
              ordered.length,

            intervalCount:
              intervals.length,

            updateIntervalAvgSec:
              average,

            updateIntervalP95Sec:
              p95Value == null
                ? null
                : round(
                    p95Value,
                  ),

            updateIntervalMaxSec:
              maximum,

            latencyAvgSec,

            requirement:
              passAtMost(
                maximum,
                session
                  .updateTargetSec,
              ),
          };
        },
      );

    const allIntervals =
      assetMetrics
        .flatMap(
          (metric) => {
            const rows =
              byAsset.get(
                metric.assetId,
              ) ?? [];

            const ordered =
              [...rows].sort(
                (a, b) =>
                  Date.parse(
                    a.observedAt,
                  ) -
                  Date.parse(
                    b.observedAt,
                  ),
              );

            const values:
              number[] = [];

            for (
              let index = 1;
              index <
              ordered.length;
              index += 1
            ) {
              values.push(
                Math.max(
                  0,
                  (
                    Date.parse(
                      ordered[index]!
                        .observedAt,
                    ) -
                    Date.parse(
                      ordered[index - 1]!.observedAt,
                    )
                  ) /
                    1000,
                ),
              );
            }

            return values;
          },
        );

    const overallUpdateAvgSec =
      allIntervals.length
        ? round(
            allIntervals.reduce(
              (
                sum,
                value,
              ) =>
                sum +
                value,
              0,
            ) /
              allIntervals.length,
          )
        : null;

    const overallUpdateP95Sec =
      p95(
        allIntervals,
      );

    const overallUpdateMaxSec =
      allIntervals.length
        ? round(
            Math.max(
              ...allIntervals,
            ),
          )
        : null;

    const attempted =
      session.shares.length;

    const delivered =
      session.shares.filter(
        (row) =>
          row.deliveredAt !=
          null,
      ).length;

    const acknowledged =
      session.shares.filter(
        (row) =>
          row.acknowledgedAt !=
          null,
      ).length;

    const deliveryPct =
      pct(
        delivered,
        attempted,
      );

    /*
     * KPI-03은 단순 수신 패킷 비율이 아니라
     * 실제 정보공유 시도 중 현장 확인(ACK)까지
     * 완료된 비율을 성공으로 계산한다.
     */
    const sharingSuccessPct =
      pct(
        acknowledged,
        attempted,
      );

    return {
      schemaVersion:
        "forest-requirement-kpi/v2",

      session: {
        sessionId:
          session.sessionId,

        eventId:
          session.eventId,

        startedAt:
          session.startedAt,

        stoppedAt:
          session.stoppedAt,

        measuredUntil:
          endAt,
      },

      targets: {
        KPI01_updateIntervalSec:
          session
            .updateTargetSec,

        KPI02_deploymentMinutes:
          session
            .deploymentTargetMinutes,

        KPI03_sharingSuccessPct:
          session
            .sharingTargetPct,

        KPI04_networkAvailabilityPct:
          session
            .availabilityTargetPct,
      },

      network: {
        measuredSec:
          round(
            networkMeasuredMs /
              1000,
          ),

        availableSec:
          round(
            networkAvailableMs /
              1000,
          ),

        upSec:
          round(
            upMs /
              1000,
          ),

        degradedSec:
          round(
            degradedMs /
              1000,
          ),

        downSec:
          round(
            downMs /
              1000,
          ),

        availabilityPct,

        transitionCount:
          transitions.length,
      },

      locationUpdates: {
        assetCount:
          assetMetrics.length,

        sampleCount:
          session
            .updates
            .length,

        updateIntervalAvgSec:
          overallUpdateAvgSec,

        updateIntervalP95Sec:
          overallUpdateP95Sec ==
          null
            ? null
            : round(
                overallUpdateP95Sec,
              ),

        updateIntervalMaxSec:
          overallUpdateMaxSec,

        assets:
          assetMetrics,
      },

      sharing: {
        attempted,
        delivered,
        acknowledged,
        deliveryPct,
        successPct:
          sharingSuccessPct,
      },

      deployment: {
        firstNetworkUpAt:
          firstUp?.at ??
          null,

        deploymentMinutes,
      },

      requirements: {
        KPI01:
          passAtMost(
            overallUpdateMaxSec,
            session
              .updateTargetSec,
          ),

        KPI02:
          passAtMost(
            deploymentMinutes,
            session
              .deploymentTargetMinutes,
          ),

        KPI03:
          passAtLeast(
            sharingSuccessPct,
            session
              .sharingTargetPct,
          ),

        KPI04:
          passAtLeast(
            availabilityPct,
            session
              .availabilityTargetPct,
          ),

        NET04:
          passAtLeast(
            availabilityPct,
            session
              .availabilityTargetPct,
          ),

        NET05:
          passAtMost(
            overallUpdateMaxSec,
            session
              .updateTargetSec,
          ),
      },

      formulas: {
        KPI01:
          "max observed position update interval <= target seconds",

        KPI02:
          "first network UP time - session start time <= target minutes",

        KPI03:
          "acknowledged information-share attempts / all information-share attempts * 100",

        KPI04:
          "(UP + DEGRADED measured time) / total measured network time * 100",

        NET04:
          "same measured network availability basis as KPI04",

        NET05:
          "per-asset AVG/P95/MAX position update intervals",
      },

      measurementScope:
        "software measurement result; field/certification evidence remains separate",
    };
  }

  private requireSession(
    sessionId: string,
  ) {
    const session =
      this.sessions.get(
        sessionId,
      );

    if (!session) {
      throw new Error(
        "KPI session not found",
      );
    }

    return session;
  }

  private requireActiveSession(
    sessionId: string,
  ) {
    const session =
      this.requireSession(
        sessionId,
      );

    if (
      session.stoppedAt
    ) {
      throw new Error(
        "KPI session is stopped",
      );
    }

    return session;
  }
}

export const requirementKpiEngine =
  new RequirementKpiEngine();
