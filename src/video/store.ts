import { randomUUID } from "node:crypto";

export type VideoChannel = {
  videoChannelId: string;
  assetId: string;
  channelCode: string;
  channelName: string;
  streamUri: string;
  enabled: boolean;
  verificationStatus: "UNVERIFIED" | "REACHABLE" | "UNREACHABLE";
  updatedAt: string;
};

export type NetworkSettings = {
  assetId: string;
  deviceIp: string;
  mavlinkForwarding: {
    protocol: "UDP";
    targetHost: string;
    targetPort: number;
  };
  updatedAt: string;
};

const channelsByAsset = new Map<string, VideoChannel[]>();
const networkByAsset = new Map<string, NetworkSettings>();

export function readVideoChannels(assetId: string): VideoChannel[] {
  return channelsByAsset.get(assetId) ?? [];
}

export function createVideoChannel(
  assetId: string,
  input: {
    channelCode: string;
    channelName: string;
    streamUri: string;
    enabled: boolean;
  },
): VideoChannel {
  const channel: VideoChannel = {
    videoChannelId: randomUUID(),
    assetId,
    channelCode: input.channelCode,
    channelName: input.channelName,
    streamUri: input.streamUri,
    enabled: input.enabled,
    verificationStatus: "UNVERIFIED",
    updatedAt: new Date().toISOString(),
  };

  channelsByAsset.set(assetId, [
    ...(channelsByAsset.get(assetId) ?? []),
    channel,
  ]);

  return channel;
}

export function updateVideoChannel(
  assetId: string,
  videoChannelId: string,
  patch: Partial<Pick<
    VideoChannel,
    "channelName" | "streamUri" | "enabled"
  >>,
): VideoChannel | null {
  const channels = channelsByAsset.get(assetId) ?? [];
  const index = channels.findIndex(
    (channel) => channel.videoChannelId === videoChannelId,
  );

  if (index < 0) return null;

  const current = channels[index]!;
  const streamChanged =
    patch.streamUri !== undefined &&
    patch.streamUri !== current.streamUri;

  const updated: VideoChannel = {
    ...current,
    ...patch,
    verificationStatus: streamChanged
      ? "UNVERIFIED"
      : current.verificationStatus,
    updatedAt: new Date().toISOString(),
  };

  const next = [...channels];
  next[index] = updated;
  channelsByAsset.set(assetId, next);

  return updated;
}

export function setVideoVerification(
  assetId: string,
  status: "REACHABLE" | "UNREACHABLE",
): void {
  const channels = channelsByAsset.get(assetId) ?? [];

  channelsByAsset.set(
    assetId,
    channels.map((channel) =>
      channel.enabled
        ? {
            ...channel,
            verificationStatus: status,
            updatedAt: new Date().toISOString(),
          }
        : channel,
    ),
  );
}

export function readNetworkSettings(assetId: string): NetworkSettings {
  return (
    networkByAsset.get(assetId) ?? {
      assetId,
      deviceIp: "",
      mavlinkForwarding: {
        protocol: "UDP",
        targetHost: "",
        targetPort: 14550,
      },
      updatedAt: new Date().toISOString(),
    }
  );
}

export function writeNetworkSettings(
  assetId: string,
  input: {
    deviceIp: string;
    mavlinkForwarding: {
      protocol: "UDP";
      targetHost: string;
      targetPort: number;
    };
  },
): NetworkSettings {
  const value: NetworkSettings = {
    assetId,
    deviceIp: input.deviceIp,
    mavlinkForwarding: input.mavlinkForwarding,
    updatedAt: new Date().toISOString(),
  };

  networkByAsset.set(assetId, value);
  return value;
}
