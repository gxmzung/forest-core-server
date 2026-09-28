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
        assetType: "UAV"
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
