import assert from "node:assert/strict";
import test from "node:test";
import {readDroneTelemetry,readDroneTelemetryBySourceAssetId,storeDroneTelemetry,resetDroneTelemetryStoreForTest} from "../src/dashboard/telemetry.js";
process.env.SUPABASE_URL="https://test.supabase.co";
process.env.SUPABASE_SECRET_KEY="test-secret";
const now=new Date('2026-09-12T01:00:00Z');
const sample={assetId:'MD1000-01',eventId:'flight',observedAt:now.toISOString(),latitude:37.55,longitude:128.4,altitude:123,batteryPct:78,attributes:{armed:true}};
test('latest state boundaries, replay does not refresh age, events isolated',()=>{
 resetDroneTelemetryStoreForTest();storeDroneTelemetry(sample,now);
 for(const [age,state] of [[0,'LIVE'],[9999,'LIVE'],[10000,'STALE'],[29999,'STALE'],[30000,'OFFLINE']] as const) assert.equal(readDroneTelemetry('flight',new Date(+now+age))[0].qualityStatus,state);
 const retry=storeDroneTelemetry(sample,new Date(+now+31000));assert.equal(retry.qualityStatus,'OFFLINE');assert.equal(retry.receivedAt,now.toISOString());
 storeDroneTelemetry({...sample,eventId:'other',latitude:38},now);assert.equal(readDroneTelemetry('flight',now)[0].latitude,37.55);assert.equal(readDroneTelemetry('missing').length,0);assert.equal(readDroneTelemetryBySourceAssetId('MD1000-01','other',now)?.latitude,38);
});
test('strict coordinate, timestamp, altitude, battery and JSON validation',()=>{
 for(const changes of [{latitude:91},{longitude:-181},{latitude:[]},{latitude:'37'},{altitude:NaN},{altitude:null},{batteryPct:101},{batteryPct:-1},{observedAt:'invalid'},{observedAt:'2027-01-01T00:00:00Z'},{assetId:''},{batteryVoltageV:-1},{attributes:{armed:'true'}}]) assert.throws(()=>storeDroneTelemetry({...sample,...changes},now));
 assert.throws(()=>storeDroneTelemetry(null as never,now));
});
test('HTTP POST, GET filtering, missing ID, invalid JSON, CORS',async()=>{
 const {app}=await import('../src/app.js');resetDroneTelemetryStoreForTest();
 const body={...sample,observedAt:new Date().toISOString()};
 const post=await app.request('/api/v1/dashboard/telemetry/drone',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(post.status,201);
 const get=await app.request('/api/v1/dashboard/telemetry/drones?eventId=flight');assert.equal((await get.json() as any).data[0].assetId,'MD1000-01');
 assert.equal((await app.request('/api/v1/dashboard/telemetry/drones/missing')).status,404);
 assert.equal((await app.request('/api/v1/dashboard/telemetry/drone',{method:'POST',body:'{'})).status,400);
 assert.equal((await app.request('/api/v1/dashboard/telemetry/drone',{method:'POST',body:JSON.stringify({...body,latitude:91})})).status,400);
 const options=await app.request('/api/v1/dashboard/telemetry/drone',{method:'OPTIONS',headers:{origin:'https://wildfire.forest.tobeunicorn.kr','access-control-request-method':'POST'}});assert.equal(options.headers.get('access-control-allow-origin'),'https://wildfire.forest.tobeunicorn.kr');
});
