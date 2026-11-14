import assert from "node:assert/strict";
import test from "node:test";

process.env.DB_MODE = "sqlite";
process.env.SQLITE_PATH = ":memory:";
process.env.SQLITE_SEED_DEMO = "false";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;

const { invokeVendor } = await import("../src/device/integration.js");

const request = {
  payloadType: "RTK_LPWA_GATEWAY",
  context: {
    eventExternalId: "RACE-JIN-1",
    sourceSystem: "jininfra",
    occurredAt: "2026-10-07T00:00:00.000Z",
    sourceDeviceId: "GW-1",
    reportedByDeviceId: "GW-1",
  },
  activePath: [],
  data: {
    gatewayDeviceId: "GW-1",
    receivedTerminalDeviceIds: [],
    observedAt: "2026-10-07T00:00:00.000Z",
    operationalStatus: "ONLINE",
  },
};

const mappings = [
  {
    vendorDeviceId: "GW-1",
    assetId: "10000000-0000-4000-8000-000000000001",
    mapped: true,
    assetExists: true,
    mappingStatus: "ACTIVE" as const,
  },
];

test("same Idempotency-Key concurrent DELIVER is handled as one insert plus one duplicate", async () => {
  const requestId = "77777777-7777-4777-8777-777777777777";

  const results = await Promise.all([
    invokeVendor("JININFRA", request, mappings, "DELIVER", requestId),
    invokeVendor("JININFRA", request, mappings, "DELIVER", requestId),
  ]);

  assert.deepEqual(results.map((item) => item.accepted), [true, true]);
  assert.deepEqual(results.map((item) => item.persisted), [true, true]);
  assert.deepEqual(results.map((item) => item.duplicate).sort(), [false, true]);
  assert.deepEqual(results.map((item) => item.recordId), [requestId, requestId]);
});

test("same Idempotency-Key remains duplicate after the concurrent winner is persisted", async () => {
  const requestId = "88888888-8888-4888-8888-888888888888";

  const first = await invokeVendor("JININFRA", request, mappings, "DELIVER", requestId);
  const second = await invokeVendor("JININFRA", request, mappings, "DELIVER", requestId);

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.persisted, true);
  assert.equal(second.recordId, requestId);
});
