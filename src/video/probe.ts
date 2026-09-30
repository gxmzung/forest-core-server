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

    let response = "";

    socket.once("connect", () => {
      const requestUri = url.toString();

      socket.write(
        `OPTIONS ${requestUri} RTSP/1.0\r\n` +
        `CSeq: 1\r\n` +
        `User-Agent: forest-core-server/1.0\r\n` +
        `\r\n`,
      );
    });

    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");

      const headerEnd = response.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;

      const statusLine = response.slice(0, headerEnd).split("\r\n")[0] ?? "";
      const match = /^RTSP\/1\.0\s+(\d{3})(?:\s+.*)?$/.exec(statusLine);

      if (!match) {
        finish(
          false,
          `RTSP ${host}:${port}에서 올바른 RTSP 응답을 받지 못했습니다.`,
        );
        return;
      }

      const statusCode = Number(match[1]);

      if (statusCode >= 200 && statusCode < 400) {
        finish(
          true,
          `RTSP ${host}:${port} OPTIONS 응답을 확인했습니다. (${statusCode})`,
        );
        return;
      }

      if (statusCode === 401 || statusCode === 403) {
        finish(
          false,
          `RTSP ${host}:${port} 서버가 인증을 요구합니다. (${statusCode})`,
        );
        return;
      }

      finish(
        false,
        `RTSP ${host}:${port} OPTIONS 요청이 거부되었습니다. (${statusCode})`,
      );
    });

    socket.once("end", () => {
      if (!settled) {
        finish(
          false,
          `RTSP ${host}:${port} 서버가 RTSP 응답 없이 연결을 종료했습니다.`,
        );
      }
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
