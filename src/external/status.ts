import {
  classifyExternalError,
  type ExternalErrorCode,
} from "./error-classifier.js";

import {
  measureExternalAttempt,
} from "./request-timing.js";

import { fetchFirmsArea } from "./firms.js";
import { fetchWildfireRisk } from "./wildfire-risk.js";
import {
  fetchLandslideForecast,
} from "./landslide-forecast.js";
import {
  fetchLandslideHistory,
} from "./landslide-history.js";
import {
  fetchLandslideRegionalRisk,
} from "./landslide-regional-risk.js";

export interface ExternalIntegrationStatus {
  id: string;
  name: string;
  status: "ok" | "failed";
  checkedAt: string;
  durationMs: number;
  message?: string;
  errorCode?: ExternalErrorCode;
  operatorMessage?: string;
  retryable?: boolean;
}

interface ExternalIntegrationDefinition {
  id: string;
  name: string;
  request: () => Promise<unknown>;
}

async function checkIntegration(
  integration: ExternalIntegrationDefinition,
): Promise<ExternalIntegrationStatus> {
  const attempt = await measureExternalAttempt(
    integration.request,
  );

  if (attempt.ok) {
    return {
      id: integration.id,
      name: integration.name,
      status: "ok",
      checkedAt: attempt.finishedAt,
      durationMs: attempt.durationMs,
    };
  }

  const classification = classifyExternalError(
    attempt.error,
  );

  return {
    id: integration.id,
    name: integration.name,
    status: "failed",
    checkedAt: attempt.finishedAt,
    durationMs: attempt.durationMs,
    message:
      attempt.error instanceof Error
        ? attempt.error.message
        : String(attempt.error),
    errorCode: classification.code,
    operatorMessage:
      classification.operatorMessage,
    retryable: classification.retryable,
  };
}

function integrations(): ExternalIntegrationDefinition[] {
  return [
    {
      id: "nasa-firms",
      name: "NASA FIRMS",
      request: () =>
        fetchFirmsArea({
          mapKey:
            process.env.NASA_FIRMS_MAP_KEY?.trim() ??
            "",
          baseUrl:
            process.env.NASA_FIRMS_BASE_URL?.trim() ??
            "https://firms.modaps.eosdis.nasa.gov",
          bbox:
            process.env.NASA_FIRMS_DEFAULT_BBOX?.trim() ??
            "124.0,33.0,132.0,39.5",
          days: 1,
          source:
            process.env.NASA_FIRMS_SOURCE?.trim() ??
            "VIIRS_SNPP_NRT",
        }),
    },
    {
      id: "kfs-wildfire-risk",
      name: "산림청 산불위험예보",
      request: () =>
        fetchWildfireRisk({
          serviceKey:
            process.env.KFS_WILDFIRE_SERVICE_KEY?.trim() ??
            "",
          baseUrl:
            process.env.KFS_WILDFIRE_BASE_URL?.trim() ??
            "http://apis.data.go.kr/1400377/forestPointV2",
          pageNo: 1,
          numOfRows: 1,
        }),
    },
    {
      id: "landslide-forecast",
      name: "산사태 예측정보",
      request: () =>
        fetchLandslideForecast({
          serviceKey:
            process.env
              .LANDSLIDE_FORECAST_SERVICE_KEY
              ?.trim() ?? "",
          baseUrl:
            process.env.SAFETY_DATA_BASE_URL?.trim() ??
            "https://www.safetydata.go.kr",
          endpoint:
            process.env
              .LANDSLIDE_FORECAST_ENDPOINT
              ?.trim() ??
            "/V2/api/DSSP-IF-00735",
          pageNo: 1,
          numOfRows: 1,
        }),
    },
    {
      id: "landslide-history",
      name: "산사태 발생이력",
      request: () =>
        fetchLandslideHistory({
          serviceKey:
            process.env
              .LANDSLIDE_HISTORY_SERVICE_KEY
              ?.trim() ?? "",
          baseUrl:
            process.env.SAFETY_DATA_BASE_URL?.trim() ??
            "https://www.safetydata.go.kr",
          endpoint:
            process.env
              .LANDSLIDE_HISTORY_ENDPOINT
              ?.trim() ??
            "/V2/api/DSSP-IF-00134",
          pageNo: 1,
          numOfRows: 1,
        }),
    },
    {
      id: "landslide-regional-risk",
      name: "산사태 지역위험정보",
      request: () =>
        fetchLandslideRegionalRisk({
          serviceKey:
            process.env
              .LANDSLIDE_REGIONAL_HISTORY_SERVICE_KEY
              ?.trim() ?? "",
          baseUrl:
            process.env.SAFETY_DATA_BASE_URL?.trim() ??
            "https://www.safetydata.go.kr",
          endpoint:
            process.env
              .LANDSLIDE_REGIONAL_RISK_ENDPOINT
              ?.trim() ??
            "/V2/api/DSSP-IF-10076",
          pageNo: 1,
          numOfRows: 1,
        }),
    },
  ];
}

export async function readExternalIntegrationStatus() {
  const data = await Promise.all(
    integrations().map(checkIntegration),
  );

  const healthy = data.filter(
    (item) => item.status === "ok",
  ).length;

  return {
    data,
    meta: {
      checkedAt: new Date().toISOString(),
      total: data.length,
      healthy,
      failed: data.length - healthy,
    },
  };
}
