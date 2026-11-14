import { fetchWithTimeout } from "./fetch-with-timeout.js";

export interface WildfireRiskRecord {
  analyzedAt: string;
  area: string;
  d1: number | null;
  d2: number | null;
  d3: number | null;
  d4: number | null;
  province: string;
  district: string;
  max: number | null;
  mean: number | null;
  min: number | null;
  regionCode: string;
  sigunguCode: string;
  standardDeviation: number | null;
  upperLocalCode: string;
}

function getTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function repairUtf8Mojibake(value: string): string {
  if (!value) return value;

  try {
    return Buffer.from(value, "latin1").toString("utf8");
  } catch {
    return value;
  }
}

function getNumber(xml: string, tag: string): number | null {
  const raw = getTag(xml, tag).replace(/,/g, "");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export async function fetchWildfireRisk(params: {
  serviceKey: string;
  baseUrl: string;
  pageNo?: number;
  numOfRows?: number;
  excludeForecast?: boolean;
}) {
  if (!params.serviceKey) {
    throw new Error("KFS_WILDFIRE_SERVICE_KEY is not configured");
  }

  const query = new URLSearchParams({
    serviceKey: (() => { try { return decodeURIComponent(params.serviceKey); } catch { return params.serviceKey; } })(),
    pageNo: String(params.pageNo ?? 1),
    _type: "xml",
    excludeForecast: params.excludeForecast ? "1" : "0",
    numOfRows: String(params.numOfRows ?? 230),
  });

  const url =
    `${params.baseUrl.replace(/\/+$/, "")}` +
    `/forestPointListSigunguSearchV2?${query.toString()}`;

  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: "application/xml,text/xml",
      "User-Agent": "forest-back-demo/1.0",
    },
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  const xml = buffer.toString("utf8");

  if (!response.ok) {
    throw new Error(`KFS wildfire risk request failed: HTTP ${response.status}`);
  }

  const resultCode = getTag(xml, "resultCode");
  const resultMsg = getTag(xml, "resultMsg");

  if (resultCode !== "00") {
    throw new Error(`KFS wildfire risk API error: ${resultCode} ${resultMsg}`);
  }

  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];

  const data: WildfireRiskRecord[] = itemMatches.map((match) => {
    const item = match[1] ?? "";

    return {
      analyzedAt: getTag(item, "analdate"),
      area: getTag(item, "area"),
      d1: getNumber(item, "d1"),
      d2: getNumber(item, "d2"),
      d3: getNumber(item, "d3"),
      d4: getNumber(item, "d4"),
      province: getTag(item, "doname"),
      district: getTag(item, "sigun"),
      max: getNumber(item, "maxi"),
      mean: getNumber(item, "meanavg"),
      min: getNumber(item, "mini"),
      regionCode: getTag(item, "regioncode"),
      sigunguCode: getTag(item, "sigucode"),
      standardDeviation: getNumber(item, "std"),
      upperLocalCode: getTag(item, "upplocalcd"),
    };
  });

  return {
    data,
    meta: {
      pageNo: getNumber(xml, "pageNo"),
      numOfRows: getNumber(xml, "numOfRows"),
      totalCount: getNumber(xml, "totalCount"),
      count: data.length,
      provider: "Korea Forest Service wildfire risk forecast",
    },
  };
}
