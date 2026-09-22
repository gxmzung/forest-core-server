import type { DroneTelemetry } from "./schema.js";

export type StoredDroneTelemetry = DroneTelemetry & {
  receivedAt: string;
};

export interface TelemetryStore {
  put(value: DroneTelemetry): StoredDroneTelemetry;
  get(droneId: string): StoredDroneTelemetry | null;
}

export function createMemoryTelemetryStore(): TelemetryStore {
  const latest = new Map<string, StoredDroneTelemetry>();

  return {
    put(value) {
      const current = latest.get(value.droneId);

      if (
        current &&
        Date.parse(value.timestamp) < Date.parse(current.timestamp)
      ) {
        return current;
      }

      const stored: StoredDroneTelemetry = {
        ...value,
        receivedAt: new Date().toISOString()
      };

      latest.set(value.droneId, stored);
      return stored;
    },

    get(droneId) {
      return latest.get(droneId) ?? null;
    }
  };
}
