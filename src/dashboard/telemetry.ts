const STALE_AFTER_MS = 10_000;
const MAX_DRONES = 100;

export class TelemetryError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

type DroneTelemetryInput = Record<string, unknown>;

export type StoredDroneTelemetry = {
  assetId: string;
  eventId?: string;
  assetType: string;
  observedAt: string;
  receivedAt: string;
  sequence?: number;
  latitude: number;
  longitude: number;
  altitude?: number;
  operationalStatus?: string;
  positioningMethod?: string;
  horizontalAccuracyM?: number;
  batteryPct?: number;
  signalStrengthDbm?: number;
  latencyMs?: number;
  packetLossPct?: number;
  activeLink?: string;
  attributes: Record<string, unknown>;
};

// P0 temporary repository: process-local latest observations, no durable history.
// Replace this interface with persistence before multi-instance production operation.
export interface DroneTelemetryRepository {
  readonly size: number;
  get(key: string): StoredDroneTelemetry | undefined;
  has(key: string): boolean;
  set(key: string, value: StoredDroneTelemetry): unknown;
  delete(key: string): boolean;
  values(): IterableIterator<StoredDroneTelemetry>;
  entries(): IterableIterator<[string, StoredDroneTelemetry]>;
  clear(): void;
}
let latestBySourceAssetId: DroneTelemetryRepository = new Map();
export function configureDroneTelemetryRepository(repository: DroneTelemetryRepository) {
  latestBySourceAssetId = repository;
}
function storageKey(assetId: string, eventId?: string) { return JSON.stringify([eventId ?? null, assetId]); }

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    throw new TelemetryError("INVALID_TELEMETRY", `${field}는 비어 있지 않은 문자열이어야 합니다.`);
  }
  return value.trim();
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new TelemetryError("INVALID_TELEMETRY", `${field}는 문자열이어야 합니다.`);
  }
  return value.trim() || undefined;
}

function finite(value: unknown, field: string, required = false): number | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) throw new TelemetryError("INVALID_TELEMETRY", `${field}는 필수 숫자입니다.`);
    return undefined;
  }
  if (typeof value === "boolean") {
    throw new TelemetryError("INVALID_TELEMETRY", `${field}는 숫자여야 합니다.`);
  }
  if (typeof value !== "number") throw new TelemetryError("INVALID_TELEMETRY", `${field} must be a number`);
  const parsed = value;
  if (!Number.isFinite(parsed)) {
    throw new TelemetryError("INVALID_TELEMETRY", `${field}는 유한한 숫자여야 합니다.`);
  }
  return parsed;
}

function validTimestamp(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text) || !Number.isFinite(Date.parse(text))) {
    throw new TelemetryError("INVALID_TELEMETRY", `${field}는 ISO-8601 시각이어야 합니다.`);
  }
  return new Date(text).toISOString();
}

function normalize(body: DroneTelemetryInput, now = new Date()): StoredDroneTelemetry {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TelemetryError('INVALID_TELEMETRY', 'JSON object required');
  const assetId = requiredText(body.assetId, "assetId");
  const observedAt = validTimestamp(body.observedAt ?? body.timestamp, "observedAt");
  if (Date.parse(observedAt) > now.getTime() + 5000) throw new TelemetryError('INVALID_TELEMETRY', 'observedAt is in the future; synchronize clocks');
  const latitude = finite(body.latitude, "latitude", true)!;
  const longitude = finite(body.longitude, "longitude", true)!;
  if (latitude < -90 || latitude > 90) {
    throw new TelemetryError("INVALID_TELEMETRY", "latitude는 -90~90 범위여야 합니다.");
  }
  if (longitude < -180 || longitude > 180) {
    throw new TelemetryError("INVALID_TELEMETRY", "longitude는 -180~180 범위여야 합니다.");
  }
  const sequenceValue = finite(body.sequence, "sequence");
  if (sequenceValue !== undefined && (!Number.isInteger(sequenceValue) || sequenceValue < 0)) {
    throw new TelemetryError("INVALID_TELEMETRY", "sequence는 0 이상의 정수여야 합니다.");
  }
  if (body.attributes !== undefined && (body.attributes === null || Array.isArray(body.attributes) || typeof body.attributes !== "object")) {
    throw new TelemetryError("INVALID_TELEMETRY", "attributes는 JSON 객체여야 합니다.");
  }

  for (const [field,min,max] of [['batteryPct',0,100],['horizontalAccuracyM',0,1e6],['packetLossPct',0,100]] as const) {
    const value = finite(body[field],field);
    if (value !== undefined && (value < min || value > max)) throw new TelemetryError('INVALID_TELEMETRY', field + ' out of range');
  }
  const attributes = {...((body.attributes as Record<string,unknown>) ?? {})};
  for (const field of ['relativeAltitudeM','headingDeg','groundSpeedMps','batteryVoltageV','missionSequence','gpsFixType','satellitesVisible','rollDeg','pitchDeg','yawDeg','systemId','componentId']) {
    const value = finite(body[field] ?? attributes[field],field);
    if (value !== undefined) attributes[field] = value;
  }
  for (const [field,min,max] of [['batteryVoltageV',0,1000],['headingDeg',0,360],['groundSpeedMps',0,1000],['gpsFixType',0,8],['satellitesVisible',0,254]] as const) {
    const value=attributes[field];
    if (typeof value==='number' && (value<min||value>max)) throw new TelemetryError('INVALID_TELEMETRY',field+' out of range');
  }
  for (const field of ['armed','flightMode','source']) if (body[field] !== undefined) attributes[field]=body[field];
  if (attributes.armed !== undefined && typeof attributes.armed !== 'boolean') throw new TelemetryError('INVALID_TELEMETRY','armed must be boolean');
  return {
    assetId,
    eventId: optionalText(body.eventId, "eventId"),
    assetType: optionalText(body.assetType, "assetType") ?? "UAV",
    observedAt,
    receivedAt: now.toISOString(),
    sequence: sequenceValue,
    latitude,
    longitude,
    altitude: finite(body.altitude, "altitude", true),
    operationalStatus: optionalText(body.operationalStatus, "operationalStatus"),
    positioningMethod: optionalText(body.positioningMethod, "positioningMethod"),
    horizontalAccuracyM: finite(body.horizontalAccuracyM, "horizontalAccuracyM"),
    batteryPct: finite(body.batteryPct, "batteryPct"),
    signalStrengthDbm: finite(body.signalStrengthDbm, "signalStrengthDbm"),
    latencyMs: finite(body.latencyMs, "latencyMs"),
    packetLossPct: finite(body.packetLossPct, "packetLossPct"),
    activeLink: optionalText(body.activeLink, "activeLink"),
    attributes,
  };
}

function evictOldestIfNeeded(incomingAssetId: string) {
  if (latestBySourceAssetId.has(incomingAssetId) || latestBySourceAssetId.size < MAX_DRONES) return;
  let oldestId: string | null = null;
  let oldestAt = Number.POSITIVE_INFINITY;
  for (const [assetId, value] of latestBySourceAssetId.entries()) {
    const at = Date.parse(value.receivedAt);
    if (at < oldestAt) {
      oldestAt = at;
      oldestId = assetId;
    }
  }
  if (oldestId) latestBySourceAssetId.delete(oldestId);
}

function decorate(value: StoredDroneTelemetry, nowMs = Date.now()) {
  const ageMs = Math.max(0, nowMs - Math.min(Date.parse(value.receivedAt), Date.parse(value.observedAt)));
  const twinState = ageMs >= 30_000 ? "OFFLINE" : ageMs >= STALE_AFTER_MS ? "STALE" : "LIVE";
  return {
    ...value,
    geometry: {
      type: "Point",
      coordinates: [value.longitude, value.latitude, value.altitude ?? null],
    },
    sourceSystem: "GCS_UPLINK",
    sourceAssetId: value.assetId,
    expectedTelemetryIntervalSec: 1,
    qualityStatus: twinState,
    attributes: {
      ...value.attributes,
      digitalTwin: {
        state: twinState,
        ageMs,
        staleAfterMs: STALE_AFTER_MS,
        offlineAfterMs: 30_000,
        synchronizedAt: value.receivedAt,
      },
    },
  };
}

export function storeDroneTelemetry(body: DroneTelemetryInput, now = new Date()) {
  const normalized = normalize(body, now);
  const key=storageKey(normalized.assetId, normalized.eventId);
  const previous = latestBySourceAssetId.get(key);

  if (previous && Date.parse(previous.observedAt) >= Date.parse(normalized.observedAt)) {
    return decorate(previous, now.getTime());
  }

  evictOldestIfNeeded(key);
  latestBySourceAssetId.set(key, normalized);
  return decorate(normalized, now.getTime());
}

export function readDroneTelemetry(eventId?: string, now = new Date()) {
  return [...latestBySourceAssetId.values()]
    .filter((row) => !eventId || row.eventId === eventId)
    .sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt))
    .map((row) => decorate(row, now.getTime()));
}

export function readDroneTelemetryBySourceAssetId(assetId: string, eventId?: string, now = new Date()) {
  const row = eventId ? latestBySourceAssetId.get(storageKey(assetId,eventId)) : [...latestBySourceAssetId.values()].filter(value=>value.assetId===assetId).sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0];
  if (!row || (eventId && row.eventId && row.eventId !== eventId)) return null;
  return decorate(row, now.getTime());
}

export function resetDroneTelemetryStoreForTest() {
  latestBySourceAssetId.clear();
}
