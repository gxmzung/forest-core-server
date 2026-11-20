import assert from "node:assert/strict";
import test from "node:test";
process.env.DB_MODE = "sqlite";
process.env.SQLITE_PATH = ":memory:";
process.env.SQLITE_SEED_DEMO = "false";
const { localDb, slenoMessages, findLocalVendorHealthState } = await import("../src/local-demo/db.js");

test("quality and vendor health queries use bounded index searches even with competing history indexes", () => {
  const db = localDb();
  db.prepare("INSERT INTO asset_type(asset_type_id,name) VALUES('rtk','RTK_TERMINAL')").run();
  const addAsset = db.prepare("INSERT INTO asset(asset_id,asset_type_id,asset_code,status,vendor_code,created_at,updated_at) VALUES(?,'rtk',?,'READY','JININFRA','now','now')");
  addAsset.run("active", "ACTIVE"); addAsset.run("silent", "SILENT");
  const addMessage = db.prepare("INSERT INTO vendor_message(request_id,vendor_code,payload_type,source_device_id,occurred_at,received_at,status,payload_json) VALUES(?,'JININFRA','RTK_POSITION',?,'2026-11-17T00:00:00Z','2026-11-17T00:00:00Z','PERSISTED','{}')");
  db.exec("BEGIN");
  for (let i = 0; i < 2000; i++) addMessage.run(`history-${i}`, "unrelated");
  addMessage.run("duplicate-1", "active"); addMessage.run("duplicate-2", "active");
  db.exec("COMMIT");
  const original = db.prepare.bind(db);
  const statements: string[] = [];
  db.prepare = (sql: string) => { statements.push(sql); return original(sql); };
  try {
    assert.equal(slenoMessages(100).length, 2, "duplicate records must remain visible");
    assert.equal(findLocalVendorHealthState("NDPS").latestMessage, null);
  } finally { db.prepare = original; }
  const quality = statements.find(sql => /FROM vendor_message.*INDEXED BY.*device_received/s.test(sql))!;
  assert.ok(quality, "quality query must remain observable for its plan regression check");
  const devicePlan = original("EXPLAIN QUERY PLAN " + quality).all("silent", 50).map(row => String(row.detail)).join(" ");
  assert.match(devicePlan, /SEARCH .*source_device_id=/);
  assert.doesNotMatch(devicePlan, /TEMP B-TREE/);
  const health = statements.find(sql => /SELECT received_at, status/.test(sql))!;
  const healthPlan = original("EXPLAIN QUERY PLAN " + health).all("NDPS").map(row => String(row.detail)).join(" ");
  assert.match(healthPlan, /SEARCH .*vendor_code=/);
  assert.doesNotMatch(healthPlan, /TEMP B-TREE/);
});
