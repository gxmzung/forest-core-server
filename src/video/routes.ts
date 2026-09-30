import { Hono } from "hono";
import {
  createVideoChannel,
  readNetworkSettings,
  readVideoChannels,
  setVideoVerification,
  updateVideoChannel,
  writeNetworkSettings,
} from "./store.js";
import { probeMavlinkUdp, probeRtsp } from "./probe.js";

export const videoRoutes = new Hono();

function validPort(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 65535
  );
}

videoRoutes.get("/:assetId/video-channels", (c) => {
  return c.json({
    data: readVideoChannels(c.req.param("assetId")),
  });
});

videoRoutes.post("/:assetId/video-channels", async (c) => {
  const body = await c.req.json().catch(() => null);

  if (
    !body ||
    typeof body.channelCode !== "string" ||
    !body.channelCode.trim() ||
    typeof body.channelName !== "string" ||
    !body.channelName.trim() ||
    typeof body.streamUri !== "string" ||
    !body.streamUri.trim() ||
    typeof body.enabled !== "boolean"
  ) {
    return c.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "영상 채널 정보가 올바르지 않습니다.",
        },
      },
      400,
    );
  }

  const channel = createVideoChannel(c.req.param("assetId"), {
    channelCode: body.channelCode.trim(),
    channelName: body.channelName.trim(),
    streamUri: body.streamUri.trim(),
    enabled: body.enabled,
  });

  return c.json({ data: channel }, 201);
});

videoRoutes.patch(
  "/:assetId/video-channels/:videoChannelId",
  async (c) => {
    const body = await c.req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return c.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "영상 채널 수정 정보가 올바르지 않습니다.",
          },
        },
        400,
      );
    }

    const patch: {
      channelName?: string;
      streamUri?: string;
      enabled?: boolean;
    } = {};

    if (body.channelName !== undefined) {
      if (
        typeof body.channelName !== "string" ||
        !body.channelName.trim()
      ) {
        return c.json(
          {
            error: {
              code: "INVALID_REQUEST",
              message: "channelName이 올바르지 않습니다.",
            },
          },
          400,
        );
      }

      patch.channelName = body.channelName.trim();
    }

    if (body.streamUri !== undefined) {
      if (
        typeof body.streamUri !== "string" ||
        !body.streamUri.trim()
      ) {
        return c.json(
          {
            error: {
              code: "INVALID_REQUEST",
              message: "streamUri가 올바르지 않습니다.",
            },
          },
          400,
        );
      }

      patch.streamUri = body.streamUri.trim();
    }

    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") {
        return c.json(
          {
            error: {
              code: "INVALID_REQUEST",
              message: "enabled가 올바르지 않습니다.",
            },
          },
          400,
        );
      }

      patch.enabled = body.enabled;
    }

    const updated = updateVideoChannel(
      c.req.param("assetId"),
      c.req.param("videoChannelId"),
      patch,
    );

    if (!updated) {
      return c.json(
        {
          error: {
            code: "VIDEO_CHANNEL_NOT_FOUND",
            message: "영상 채널을 찾을 수 없습니다.",
          },
        },
        404,
      );
    }

    return c.json({ data: updated });
  },
);

videoRoutes.get("/:assetId/network-settings", (c) => {
  return c.json({
    data: readNetworkSettings(c.req.param("assetId")),
  });
});

videoRoutes.patch("/:assetId/network-settings", async (c) => {
  const body = await c.req.json().catch(() => null);
  const forwarding = body?.mavlinkForwarding;

  if (
    !body ||
    typeof body.deviceIp !== "string" ||
    !forwarding ||
    forwarding.protocol !== "UDP" ||
    typeof forwarding.targetHost !== "string" ||
    !validPort(forwarding.targetPort)
  ) {
    return c.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "장비 네트워크 설정이 올바르지 않습니다.",
        },
      },
      400,
    );
  }

  return c.json({
    data: writeNetworkSettings(c.req.param("assetId"), {
      deviceIp: body.deviceIp.trim(),
      mavlinkForwarding: {
        protocol: "UDP",
        targetHost: forwarding.targetHost.trim(),
        targetPort: forwarding.targetPort,
      },
    }),
  });
});

videoRoutes.post("/:assetId/connection-probes", async (c) => {
  const assetId = c.req.param("assetId");
  const body = await c.req.json().catch(() => null);

  if (
    !body ||
    (body.type !== "MAVLINK_UDP" && body.type !== "RTSP")
  ) {
    return c.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "지원하지 않는 연결 확인 유형입니다.",
        },
      },
      400,
    );
  }

  if (body.type === "MAVLINK_UDP") {
    const network = readNetworkSettings(assetId);

    return c.json({
      data: probeMavlinkUdp(
        network.mavlinkForwarding.targetHost,
        network.mavlinkForwarding.targetPort,
      ),
    });
  }

  const channel =
    readVideoChannels(assetId).find((item) => item.enabled) ??
    readVideoChannels(assetId)[0];

  if (!channel?.streamUri) {
    return c.json(
      {
        data: {
          type: "RTSP",
          success: false,
          detail: "등록된 RTSP 영상 채널이 없습니다.",
          elapsedMs: 0,
        },
      },
      200,
    );
  }

  const result = await probeRtsp(channel.streamUri);

  setVideoVerification(
    assetId,
    result.success ? "REACHABLE" : "UNREACHABLE",
  );

  return c.json({ data: result });
});
