export type DroneTelemetry = {
  droneId: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  altitude: number;
};

export function parseDroneTelemetry(value: unknown): DroneTelemetry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("telemetry payload must be an object");
  }

  const row = value as Record<string, unknown>;
  const droneId = String(row.droneId ?? "").trim();
  const timestamp = String(row.timestamp ?? "").trim();
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  const altitude = Number(row.altitude);

  if (!droneId) throw new Error("droneId is required");

  if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
    throw new Error("timestamp must be ISO-8601");
  }

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error("latitude is invalid");
  }

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("longitude is invalid");
  }

  if (!Number.isFinite(altitude)) {
    throw new Error("altitude is invalid");
  }

  return {
    droneId,
    timestamp,
    latitude,
    longitude,
    altitude
  };
}
