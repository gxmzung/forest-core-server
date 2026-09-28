export type DroneTelemetry = {
  droneId: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  altitude: number;
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

  // UTC(Z) 또는 명시적 timezone offset이 있는 ISO-8601 timestamp만 허용한다.
  const iso8601 =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

  if (!iso8601.test(timestamp) || Number.isNaN(Date.parse(timestamp))) {
    throw new Error("timestamp must be ISO-8601");
  }

  return timestamp;
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
    altitude
  };
}
