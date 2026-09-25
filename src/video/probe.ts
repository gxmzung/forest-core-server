import net from "node:net";

export type ProbeResult = {
  type: "MAVLINK_UDP" | "RTSP";
  success: boolean;
  detail: string;
  elapsedMs: number;
};

function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

export async function probeRtsp(
  streamUri: string,
  timeoutMs = 2500,
): Promise<ProbeResult> {
  const startedAt = Date.now();

  let url: URL;

  try {
    url = new URL(streamUri);
  } catch {
    return {
      type: "RTSP",
      success: false,
      detail: "RTSP 주소 형식이 올바르지 않습니다.",
      elapsedMs: elapsed(startedAt),
    };
  }

  if (url.protocol !== "rtsp:") {
    return {
      type: "RTSP",
      success: false,
      detail: "rtsp:// 주소가 필요합니다.",
      elapsedMs: elapsed(startedAt),
    };
  }

  const host = url.hostname;
  const port = url.port ? Number(url.port) : 554;

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    return {
      type: "RTSP",
      success: false,
      detail: "RTSP 호스트 또는 포트가 올바르지 않습니다.",
      elapsedMs: elapsed(startedAt),
    };
  }

  return await new Promise<ProbeResult>((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (success: boolean, detail: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();

      resolve({
        type: "RTSP",
        success,
        detail,
        elapsedMs: elapsed(startedAt),
      });
    };

    socket.setTimeout(timeoutMs);

    socket.once("connect", () => {
      finish(
        true,
        `RTSP TCP ${host}:${port} 연결에 성공했습니다.`,
      );
    });

    socket.once("timeout", () => {
      finish(
        false,
        `RTSP TCP ${host}:${port} 연결 시간이 초과되었습니다.`,
      );
    });

    socket.once("error", (error) => {
      finish(
        false,
        `RTSP TCP ${host}:${port} 연결 실패: ${error.message}`,
      );
    });
  });
}

export function probeMavlinkUdp(
  targetHost: string,
  targetPort: number,
): ProbeResult {
  const startedAt = Date.now();

  const valid =
    Boolean(targetHost.trim()) &&
    Number.isInteger(targetPort) &&
    targetPort >= 1 &&
    targetPort <= 65535;

  return {
    type: "MAVLINK_UDP",
    success: valid,
    detail: valid
      ? `UDP 전달 대상 ${targetHost}:${targetPort} 설정을 확인했습니다. 실제 MAVLink 수신 여부는 GCS 장비에서 검증해야 합니다.`
      : "MAVLink UDP 대상 설정이 올바르지 않습니다.",
    elapsedMs: elapsed(startedAt),
  };
}
