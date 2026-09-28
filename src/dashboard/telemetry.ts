import {
  telemetryStore,
  type TelemetryStore
} from "../telemetry/store.js";

function positioningMethod(
  gpsFixType?: number
): "GNSS" | "DGPS" | "RTK" {
  if (gpsFixType === 5 || gpsFixType === 6) {
    return "RTK";
  }

  if (gpsFixType === 4) {
    return "DGPS";
  }

  return "GNSS";
}

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

    positioningMethod:
      positioningMethod(
        telemetry.gpsFixType
      ),

    attributes: {
      telemetryPositionSource:
        telemetry.positionSource ??
        "GLOBAL_POSITION_INT(33)",

      gpsFixType:
        telemetry.gpsFixType,

      satellitesVisible:
        telemetry.satellitesVisible,

      hdop:
        telemetry.hdop,

      vdop:
        telemetry.vdop,

      horizontalAccuracy:
        telemetry.horizontalAccuracy,

      verticalAccuracy:
        telemetry.verticalAccuracy
    }
  }));
}
