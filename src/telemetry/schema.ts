export type DroneTelemetry = {
  droneId: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  altitude: number;

  positionSource?: string;
  gpsFixType?: number;
  satellitesVisible?: number;
  hdop?: number;
  vdop?: number;
  horizontalAccuracy?: number;
  verticalAccuracy?: number;

  mavlinkVersion?: number;
  mavlinkSystemId?: number;
  mavlinkComponentId?: number;
  mavlinkSequence?: number;
  mavlinkMessageId?: number;

  qualityWindowExpected?: number;
  qualityWindowReceived?: number;
  qualityWindowLost?: number;
  packetLossPct?: number;
  periodAvgMs?: number;
  periodP95Ms?: number;
  periodMaxMs?: number;
};

function requireFiniteNumber(
  value: unknown,
  name: "latitude" | "longitude" | "altitude"
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} is invalid`);
  }

  return value;
}

function requireIsoTimestamp(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("timestamp must be ISO-8601");
  }

  const timestamp = value.trim();

  const iso8601 =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

  if (!iso8601.test(timestamp) || Number.isNaN(Date.parse(timestamp))) {
    throw new Error("timestamp must be ISO-8601");
  }

  return timestamp;
}

function optionalFiniteNonNegative(
  value: unknown,
  name: string
): number | undefined {
  if (value == null) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(`${name} is invalid`);
  }

  return value;
}


function optionalFiniteRange(
  value: unknown,
  name: string,
  min: number,
  max: number
): number | undefined {
  if (value == null) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`${name} is invalid`);
  }

  return value;
}

function optionalInteger(
  value: unknown,
  name: string,
  min: number,
  max: number
): number | undefined {
  if (value == null) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`${name} is invalid`);
  }

  return value;
}

function optionalString(
  value: unknown,
  name: string
): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is invalid`);
  }

  return value.trim();
}

export function parseDroneTelemetry(value: unknown): DroneTelemetry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("telemetry payload must be an object");
  }

  const row = value as Record<string, unknown>;

  if (typeof row.droneId !== "string") {
    throw new Error("droneId is required");
  }

  const droneId = row.droneId.trim();

  if (!droneId) {
    throw new Error("droneId is required");
  }

  const timestamp = requireIsoTimestamp(row.timestamp);
  const latitude = requireFiniteNumber(row.latitude, "latitude");
  const longitude = requireFiniteNumber(row.longitude, "longitude");
  const altitude = requireFiniteNumber(row.altitude, "altitude");

  if (latitude < -90 || latitude > 90) {
    throw new Error("latitude is invalid");
  }

  if (longitude < -180 || longitude > 180) {
    throw new Error("longitude is invalid");
  }

  return {
    droneId,
    timestamp,
    latitude,
    longitude,
    altitude,

    positionSource:
      optionalString(
        row.positionSource,
        "positionSource"
      ),

    gpsFixType:
      optionalInteger(
        row.gpsFixType,
        "gpsFixType",
        0,
        255
      ),

    satellitesVisible:
      optionalInteger(
        row.satellitesVisible,
        "satellitesVisible",
        0,
        254
      ),

    hdop:
      optionalFiniteNonNegative(
        row.hdop,
        "hdop"
      ),

    vdop:
      optionalFiniteNonNegative(
        row.vdop,
        "vdop"
      ),

    horizontalAccuracy:
      optionalFiniteNonNegative(
        row.horizontalAccuracy,
        "horizontalAccuracy"
      ),

    verticalAccuracy:
      optionalFiniteNonNegative(
        row.verticalAccuracy,
        "verticalAccuracy"
      ),

    mavlinkVersion:
      optionalInteger(
        row.mavlinkVersion,
        "mavlinkVersion",
        1,
        2
      ),

    mavlinkSystemId:
      optionalInteger(
        row.mavlinkSystemId,
        "mavlinkSystemId",
        0,
        255
      ),

    mavlinkComponentId:
      optionalInteger(
        row.mavlinkComponentId,
        "mavlinkComponentId",
        0,
        255
      ),

    mavlinkSequence:
      optionalInteger(
        row.mavlinkSequence,
        "mavlinkSequence",
        0,
        255
      ),

    mavlinkMessageId:
      optionalInteger(
        row.mavlinkMessageId,
        "mavlinkMessageId",
        0,
        16777215
      ),

    qualityWindowExpected:
      optionalInteger(
        row.qualityWindowExpected,
        "qualityWindowExpected",
        0,
        100
      ),

    qualityWindowReceived:
      optionalInteger(
        row.qualityWindowReceived,
        "qualityWindowReceived",
        0,
        100
      ),

    qualityWindowLost:
      optionalInteger(
        row.qualityWindowLost,
        "qualityWindowLost",
        0,
        100
      ),

    packetLossPct:
      optionalFiniteRange(
        row.packetLossPct,
        "packetLossPct",
        0,
        100
      ),

    periodAvgMs:
      optionalFiniteNonNegative(
        row.periodAvgMs,
        "periodAvgMs"
      ),

    periodP95Ms:
      optionalFiniteNonNegative(
        row.periodP95Ms,
        "periodP95Ms"
      ),

    periodMaxMs:
      optionalFiniteNonNegative(
        row.periodMaxMs,
        "periodMaxMs"
      )
  };
}
