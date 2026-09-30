import type { StoredDroneTelemetry } from "./store.js";

export type TelemetryStreamMessage = {
  assetId: string;
  observedAt: string;
  receivedAt: string;
  sequence: number;
  latitude: number;
  longitude: number;
  altitude: number;
  assetType: "UAV";
  packetLossPct?: number;
  attributes?: {
    linkQuality?: {
      mavlinkVersion?: number;
      mavlinkSystemId?: number;
      mavlinkComponentId?: number;
      mavlinkSequence?: number;
      mavlinkMessageId?: number;
      windowExpected?: number;
      windowReceived?: number;
      windowLost?: number;
      periodAvgMs?: number;
      periodP95Ms?: number;
      periodMaxMs?: number;
    };
  };
};

type Listener = (message: TelemetryStreamMessage) => void;

export interface TelemetryHub {
  publish(value: StoredDroneTelemetry): TelemetryStreamMessage;
  subscribe(listener: Listener): () => void;
}

export function createTelemetryHub(): TelemetryHub {
  const listeners = new Set<Listener>();
  const sequences = new Map<string, number>();

  return {
    publish(value) {
      const sequence = (sequences.get(value.droneId) ?? 0) + 1;
      sequences.set(value.droneId, sequence);

      const message: TelemetryStreamMessage = {
        assetId: value.droneId,
        observedAt: value.timestamp,
        receivedAt: value.receivedAt,
        sequence,
        latitude: value.latitude,
        longitude: value.longitude,
        altitude: value.altitude,
        assetType: "UAV",
        packetLossPct: value.packetLossPct,
        attributes: {
          linkQuality: {
            mavlinkVersion: value.mavlinkVersion,
            mavlinkSystemId: value.mavlinkSystemId,
            mavlinkComponentId: value.mavlinkComponentId,
            mavlinkSequence: value.mavlinkSequence,
            mavlinkMessageId: value.mavlinkMessageId,
            windowExpected: value.qualityWindowExpected,
            windowReceived: value.qualityWindowReceived,
            windowLost: value.qualityWindowLost,
            periodAvgMs: value.periodAvgMs,
            periodP95Ms: value.periodP95Ms,
            periodMaxMs: value.periodMaxMs
          }
        }
      };

      for (const listener of listeners) {
        listener(message);
      }

      return message;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

export const telemetryHub = createTelemetryHub();
