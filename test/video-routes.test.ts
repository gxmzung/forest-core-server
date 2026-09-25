import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SECRET_KEY = "test-secret";

const assetId = "20000000-0000-4000-8000-000000000099";

test("영상 채널 등록과 조회가 동작한다", async () => {
  const { app } = await import("../src/app.js");

  const created = await app.request(
    `/api/v1/assets/${assetId}/video-channels`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channelCode: "MAIN",
        channelName: "주 영상",
        streamUri: "rtsp://127.0.0.1:18554/live",
        enabled: true,
      }),
    },
  );

  assert.equal(created.status, 201);

  const createdBody = await created.json() as {
    data: { videoChannelId: string; verificationStatus: string };
  };

  assert.ok(createdBody.data.videoChannelId);
  assert.equal(createdBody.data.verificationStatus, "UNVERIFIED");

  const listed = await app.request(
    `/api/v1/assets/${assetId}/video-channels`,
  );

  const listedBody = await listed.json() as {
    data: Array<{ streamUri: string }>;
  };

  assert.equal(listed.status, 200);
  assert.equal(
    listedBody.data[0]?.streamUri,
    "rtsp://127.0.0.1:18554/live",
  );
});

test("장비 네트워크 설정 저장과 조회가 동작한다", async () => {
  const { app } = await import("../src/app.js");

  const updated = await app.request(
    `/api/v1/assets/${assetId}/network-settings`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceIp: "172.30.1.20",
        mavlinkForwarding: {
          protocol: "UDP",
          targetHost: "127.0.0.1",
          targetPort: 14550,
        },
      }),
    },
  );

  assert.equal(updated.status, 200);

  const read = await app.request(
    `/api/v1/assets/${assetId}/network-settings`,
  );

  const body = await read.json() as {
    data: {
      deviceIp: string;
      mavlinkForwarding: { targetPort: number };
    };
  };

  assert.equal(body.data.deviceIp, "172.30.1.20");
  assert.equal(body.data.mavlinkForwarding.targetPort, 14550);
});

test("RTSP probe는 TCP 연결 가능 여부를 반환한다", async () => {
  const { app } = await import("../src/app.js");

  const server = net.createServer();

  await new Promise<void>((resolve) => {
    server.listen(18554, "127.0.0.1", resolve);
  });

  try {
    const response = await app.request(
      `/api/v1/assets/${assetId}/connection-probes`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "RTSP" }),
      },
    );

    const body = await response.json() as {
      data: { type: string; success: boolean; elapsedMs: number };
    };

    assert.equal(response.status, 200);
    assert.equal(body.data.type, "RTSP");
    assert.equal(body.data.success, true);
    assert.ok(body.data.elapsedMs >= 0);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
