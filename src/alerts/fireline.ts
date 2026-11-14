export type FirelineCoordinate =
  [number, number];

export type FirelineSeverity =
  | "INFO"
  | "WATCH"
  | "WARNING"
  | "CRITICAL";

export type FirelineRule = {
  eventId: string;
  firelineId: string;
  coordinates:
    FirelineCoordinate[];

  thresholdM: number;
  clearDistanceM: number;
  cooldownSec: number;

  severity:
    FirelineSeverity;

  assetIds:
    string[] | null;
};

export type FirelinePosition = {
  assetId: string;

  resourceType?:
    string;

  eventId?:
    string;

  longitude: number;
  latitude: number;

  observedAt: string;
};

export type FirelineApproachEvent = {
  sourceAlertId: string;

  eventId: string;
  firelineId: string;

  assetId: string;
  resourceType:
    string | null;

  longitude: number;
  latitude: number;

  distanceM: number;
  thresholdM: number;

  severity:
    FirelineSeverity;

  detectedAt: string;

  title: string;
  message: string;
  location: string;
};

type FirelineState = {
  active: boolean;

  lastDistanceM:
    number | null;

  lastAlertAt:
    string | null;

  lastObservedAt:
    string | null;
};

const EARTH_RADIUS_M =
  6_371_008.8;

function finite(
  value: unknown,
  name: string,
) {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed)
  ) {
    throw new Error(
      `${name} must be finite`,
    );
  }

  return parsed;
}

function positive(
  value: unknown,
  name: string,
) {
  const parsed =
    finite(
      value,
      name,
    );

  if (parsed <= 0) {
    throw new Error(
      `${name} must be > 0`,
    );
  }

  return parsed;
}

function nonNegative(
  value: unknown,
  name: string,
) {
  const parsed =
    finite(
      value,
      name,
    );

  if (parsed < 0) {
    throw new Error(
      `${name} must be >= 0`,
    );
  }

  return parsed;
}

function requiredText(
  value: unknown,
  name: string,
) {
  const text =
    String(
      value ?? "",
    ).trim();

  if (!text) {
    throw new Error(
      `${name} is required`,
    );
  }

  return text;
}

function validTime(
  value: unknown,
  name: string,
) {
  const text =
    requiredText(
      value,
      name,
    );

  if (
    !Number.isFinite(
      Date.parse(text),
    )
  ) {
    throw new Error(
      `${name} must be ISO-8601`,
    );
  }

  return text;
}

function coordinate(
  value: unknown,
): FirelineCoordinate {
  if (
    !Array.isArray(value) ||
    value.length < 2
  ) {
    throw new Error(
      "invalid fireline coordinate",
    );
  }

  const longitude =
    finite(
      value[0],
      "longitude",
    );

  const latitude =
    finite(
      value[1],
      "latitude",
    );

  if (
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new Error(
      "fireline coordinate out of range",
    );
  }

  return [
    longitude,
    latitude,
  ];
}

function coordinatesOf(
  value: unknown,
) {
  if (
    !Array.isArray(value) ||
    value.length < 2
  ) {
    throw new Error(
      "fireline requires at least 2 coordinates",
    );
  }

  return value.map(
    coordinate,
  );
}

function assetIdsOf(
  value: unknown,
): string[] | null {
  if (value == null) {
    return null;
  }

  if (!Array.isArray(value)) {
    throw new Error(
      "assetIds must be an array",
    );
  }

  const ids =
    value
      .map(
        (row) =>
          String(
            row ?? "",
          ).trim(),
      )
      .filter(Boolean);

  return ids.length
    ? [...new Set(ids)]
    : null;
}

function severityOf(
  value: unknown,
): FirelineSeverity {
  const severity =
    String(
      value ??
      "CRITICAL",
    )
      .trim()
      .toUpperCase();

  if (
    severity !== "INFO" &&
    severity !== "WATCH" &&
    severity !== "WARNING" &&
    severity !== "CRITICAL"
  ) {
    throw new Error(
      "invalid fireline severity",
    );
  }

  return severity;
}

/*
 * 짧은 현장 거리 계산용 WGS84 근사 투영.
 *
 * 기준 위치를 원점으로 두고
 * 위경도 차이를 미터 단위 평면으로 바꾼 뒤
 * 각 LineString 구간과 점 사이 최단거리를 계산한다.
 */
function segmentDistanceM(
  longitude: number,
  latitude: number,
  start:
    FirelineCoordinate,
  end:
    FirelineCoordinate,
) {
  const latitudeRad =
    latitude *
    Math.PI /
    180;

  const xScale =
    EARTH_RADIUS_M *
    Math.cos(
      latitudeRad,
    ) *
    Math.PI /
    180;

  const yScale =
    EARTH_RADIUS_M *
    Math.PI /
    180;

  const ax =
    (
      start[0] -
      longitude
    ) *
    xScale;

  const ay =
    (
      start[1] -
      latitude
    ) *
    yScale;

  const bx =
    (
      end[0] -
      longitude
    ) *
    xScale;

  const by =
    (
      end[1] -
      latitude
    ) *
    yScale;

  const dx =
    bx - ax;

  const dy =
    by - ay;

  const lengthSquared =
    dx * dx +
    dy * dy;

  if (
    lengthSquared === 0
  ) {
    return Math.hypot(
      ax,
      ay,
    );
  }

  const t =
    Math.max(
      0,
      Math.min(
        1,
        -(
          ax * dx +
          ay * dy
        ) /
          lengthSquared,
      ),
    );

  return Math.hypot(
    ax +
      t * dx,

    ay +
      t * dy,
  );
}

export function pointToFirelineDistanceM(
  longitude: number,
  latitude: number,
  coordinates:
    readonly FirelineCoordinate[],
) {
  if (
    coordinates.length < 2
  ) {
    throw new Error(
      "fireline requires at least 2 coordinates",
    );
  }

  let minimum =
    Number.POSITIVE_INFINITY;

  for (
    let index = 1;
    index <
    coordinates.length;
    index += 1
  ) {
    minimum =
      Math.min(
        minimum,

        segmentDistanceM(
          longitude,
          latitude,
          coordinates[
            index - 1
          ]!,
          coordinates[
            index
          ]!,
        ),
      );
  }

  return Number(
    minimum.toFixed(3),
  );
}

function cloneRule(
  rule: FirelineRule,
): FirelineRule {
  return {
    ...rule,

    coordinates:
      rule.coordinates
        .map(
          (row) => [
            row[0],
            row[1],
          ],
        ),

    assetIds:
      rule.assetIds
        ? [...rule.assetIds]
        : null,
  };
}

export class FirelineApproachEngine {
  private readonly rules =
    new Map<
      string,
      FirelineRule
    >();

  private readonly states =
    new Map<
      string,
      FirelineState
    >();

  reset() {
    this.rules.clear();
    this.states.clear();
  }

  upsertRule(
    input: {
      eventId: unknown;
      firelineId: unknown;
      coordinates: unknown;

      thresholdM: unknown;

      clearDistanceM?:
        unknown;

      cooldownSec?:
        unknown;

      severity?:
        unknown;

      assetIds?:
        unknown;
    },
  ) {
    const eventId =
      requiredText(
        input.eventId,
        "eventId",
      );

    const firelineId =
      requiredText(
        input.firelineId,
        "firelineId",
      );

    const thresholdM =
      positive(
        input.thresholdM,
        "thresholdM",
      );

    const clearDistanceM =
      input.clearDistanceM ==
      null
        ? thresholdM * 1.2
        : positive(
            input.clearDistanceM,
            "clearDistanceM",
          );

    if (
      clearDistanceM <
      thresholdM
    ) {
      throw new Error(
        "clearDistanceM must be >= thresholdM",
      );
    }

    const rule:
      FirelineRule = {
        eventId,
        firelineId,

        coordinates:
          coordinatesOf(
            input.coordinates,
          ),

        thresholdM,

        clearDistanceM,

        cooldownSec:
          input.cooldownSec ==
          null
            ? 60
            : nonNegative(
                input.cooldownSec,
                "cooldownSec",
              ),

        severity:
          severityOf(
            input.severity,
          ),

        assetIds:
          assetIdsOf(
            input.assetIds,
          ),
      };

    this.rules.set(
      firelineId,
      rule,
    );

    return cloneRule(
      rule,
    );
  }

  removeRule(
    firelineId: string,
  ) {
    const removed =
      this.rules.delete(
        firelineId,
      );

    const prefix =
      `${firelineId}\u0000`;

    for (
      const key of
      this.states.keys()
    ) {
      if (
        key.startsWith(
          prefix,
        )
      ) {
        this.states.delete(
          key,
        );
      }
    }

    return removed;
  }

  listRules() {
    return [
      ...this.rules.values(),
    ].map(cloneRule);
  }

  status() {
    return [
      ...this.states.entries(),
    ].map(
      ([key, state]) => ({
        key,
        ...state,
      }),
    );
  }

  evaluate(
    position:
      FirelinePosition,
  ):
    FirelineApproachEvent[] {
    const assetId =
      requiredText(
        position.assetId,
        "assetId",
      );

    const longitude =
      finite(
        position.longitude,
        "longitude",
      );

    const latitude =
      finite(
        position.latitude,
        "latitude",
      );

    if (
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new Error(
        "position coordinate out of range",
      );
    }

    const observedAt =
      validTime(
        position.observedAt,
        "observedAt",
      );

    const observedMs =
      Date.parse(
        observedAt,
      );

    const events:
      FirelineApproachEvent[] =
      [];

    for (
      const rule of
      this.rules.values()
    ) {
      if (
        position.eventId &&
        rule.eventId !==
          position.eventId
      ) {
        continue;
      }

      if (
        rule.assetIds &&
        !rule.assetIds.includes(
          assetId,
        )
      ) {
        continue;
      }

      const distanceM =
        pointToFirelineDistanceM(
          longitude,
          latitude,
          rule.coordinates,
        );

      const key =
        `${rule.firelineId}\u0000${assetId}`;

      const previous =
        this.states.get(
          key,
        ) ?? {
          active: false,
          lastDistanceM:
            null,
          lastAlertAt:
            null,
          lastObservedAt:
            null,
        };

      if (
        previous.active &&
        distanceM >=
          rule.clearDistanceM
      ) {
        previous.active =
          false;
      }

      const inside =
        distanceM <=
        rule.thresholdM;

      let createAlert =
        false;

      if (
        inside &&
        !previous.active
      ) {
        const lastAlertMs =
          previous
            .lastAlertAt
            ? Date.parse(
                previous
                  .lastAlertAt,
              )
            : null;

        const cooldownMs =
          rule.cooldownSec *
          1000;

        if (
          lastAlertMs ==
            null ||
          observedMs -
            lastAlertMs >=
            cooldownMs
        ) {
          createAlert =
            true;

          previous.lastAlertAt =
            observedAt;
        }

        previous.active =
          true;
      }

      previous.lastDistanceM =
        distanceM;

      previous.lastObservedAt =
        observedAt;

      this.states.set(
        key,
        previous,
      );

      if (!createAlert) {
        continue;
      }

      const sourceAlertId =
        [
          "FIRELINE",
          rule.firelineId,
          assetId,
          observedMs,
        ].join("-");

      events.push({
        sourceAlertId,

        eventId:
          rule.eventId,

        firelineId:
          rule.firelineId,

        assetId,

        resourceType:
          position.resourceType
            ?.trim() ||
          null,

        longitude,
        latitude,

        distanceM,

        thresholdM:
          rule.thresholdM,

        severity:
          rule.severity,

        detectedAt:
          observedAt,

        title:
          "화선 접근 경보",

        message:
          `${assetId}가 화선 ${rule.firelineId} 기준 ${distanceM.toFixed(1)}m까지 접근했습니다.`,

        location:
          `${latitude.toFixed(6)},${longitude.toFixed(6)} / 화선거리 ${distanceM.toFixed(1)}m`,
      });
    }

    return events;
  }
}

export const firelineApproachEngine =
  new FirelineApproachEngine();
