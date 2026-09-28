import {
  telemetryStore,
  type TelemetryStore
} from "../telemetry/store.js";

export function readDashboardDroneTelemetry(
  eventId: string,
  store: TelemetryStore = telemetryStore
) {
  return store.list().map((telemetry) => ({
    eventId,
    assetId: telemetry.droneId,
    sourceAssetId: telemetry.droneId,
    assetType: "UAV",
    observedAt: telemetry.timestamp,
    receivedAt: telemetry.receivedAt,
    latitude: telemetry.latitude,
    longitude: telemetry.longitude,
    altitude: telemetry.altitude,
    operationalStatus: "ACTIVE",
    positioningMethod: "GNSS",
    attributes: {
      telemetryPositionSource:
        "GLOBAL_POSITION_INT(33)"
    }
  }));
}