import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyExternalError,
} from "../src/external/error-classifier.js";

import {
  EXTERNAL_REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
} from "../src/external/fetch-with-timeout.js";

import {
  measureExternalAttempt,
} from "../src/external/request-timing.js";

import {
  externalRoutes,
} from "../src/external/routes.js";

test(
  "외부기관 기본 timeout은 8초다",
  () => {
    assert.equal(
      EXTERNAL_REQUEST_TIMEOUT_MS,
      8_000,
    );
  },
);

test(
  "외부기관 timeout 시 요청을 중단한다",
  async (t) => {
    const originalFetch = globalThis.fetch;

    t.after(() => {
      globalThis.fetch = originalFetch;
    });

    globalThis.fetch = (async (
      _input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      return await new Promise<Response>(
        (_resolve, reject) => {
          const signal = init?.signal;

          if (!signal) {
            reject(
              new Error("AbortSignal missing"),
            );
            return;
          }

          const abort = () => {
            reject(new Error("aborted"));
          };

          if (signal.aborted) {
            abort();
            return;
          }

          signal.addEventListener(
            "abort",
            abort,
            { once: true },
          );
        },
      );
    }) as typeof fetch;

    await assert.rejects(
      () =>
        fetchWithTimeout(
          "https://provider.example/slow",
          {},
          20,
        ),
      /timed out after 20ms/,
    );
  },
);

test(
  "외부기관 오류를 운영 원인별로 분류한다",
  () => {
    assert.equal(
      classifyExternalError(
        new Error(
          "NASA_FIRMS_MAP_KEY is not configured",
        ),
      ).code,
      "CONFIGURATION_ERROR",
    );

    assert.equal(
      classifyExternalError(
        new Error("provider HTTP 429"),
      ).code,
      "RATE_LIMITED",
    );

    assert.equal(
      classifyExternalError(
        new Error(
          "External provider request timed out after 8000ms",
        ),
      ).code,
      "TIMEOUT",
    );

    assert.equal(
      classifyExternalError(
        new Error("fetch failed: ECONNRESET"),
      ).code,
      "NETWORK_FAILURE",
    );

    assert.equal(
      classifyExternalError(
        new Error("provider HTTP 502"),
      ).code,
      "PROVIDER_ERROR",
    );
  },
);

test(
  "외부기관 성공/실패 요청의 처리시간을 측정한다",
  async () => {
    const successTimes = [
      1_000,
      1_125,
    ];

    const success =
      await measureExternalAttempt(
        async () => "ok",
        () => successTimes.shift()!,
      );

    assert.equal(success.ok, true);

    if (success.ok) {
      assert.equal(success.value, "ok");
      assert.equal(success.durationMs, 125);
    }

    const failureTimes = [
      2_000,
      2_250,
    ];

    const failure =
      await measureExternalAttempt(
        async () => {
          throw new Error(
            "provider failure",
          );
        },
        () => failureTimes.shift()!,
      );

    assert.equal(failure.ok, false);

    if (!failure.ok) {
      assert.equal(
        failure.durationMs,
        250,
      );

      assert.match(
        String(failure.error),
        /provider failure/,
      );
    }
  },
);

test(
  "external status는 개별 연계 실패에도 전체 상태를 반환한다",
  async () => {
    const keys = [
      "NASA_FIRMS_MAP_KEY",
      "KFS_WILDFIRE_SERVICE_KEY",
      "LANDSLIDE_FORECAST_SERVICE_KEY",
      "LANDSLIDE_HISTORY_SERVICE_KEY",
      "LANDSLIDE_REGIONAL_HISTORY_SERVICE_KEY",
    ];

    const backup = Object.fromEntries(
      keys.map(
        (key) => [key, process.env[key]],
      ),
    );

    try {
      for (const key of keys) {
        delete process.env[key];
      }

      const response =
        await externalRoutes.request(
          "http://localhost/status",
        );

      assert.equal(response.status, 200);

      const body =
        await response.json() as {
          data: Array<{
            id: string;
            status: "ok" | "failed";
            durationMs: number;
            errorCode?: string;
            retryable?: boolean;
          }>;
          meta: {
            total: number;
            healthy: number;
            failed: number;
          };
        };

      assert.equal(body.meta.total, 5);
      assert.equal(body.meta.healthy, 0);
      assert.equal(body.meta.failed, 5);
      assert.equal(body.data.length, 5);

      assert.ok(
        body.data.every(
          (item) =>
            item.status === "failed",
        ),
      );

      assert.ok(
        body.data.every(
          (item) =>
            item.errorCode ===
            "CONFIGURATION_ERROR",
        ),
      );

      assert.ok(
        body.data.every(
          (item) =>
            item.durationMs >= 0,
        ),
      );
    } finally {
      for (const key of keys) {
        const value = backup[key];

        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  },
);

test(
  "외부 API 오류 응답에서도 운영 origin CORS를 유지한다",
  async () => {
    const previous = {
      nasa:
        process.env.NASA_FIRMS_MAP_KEY,
      supabaseUrl:
        process.env.SUPABASE_URL,
      supabaseSecret:
        process.env.SUPABASE_SECRET_KEY,
    };

    try {
      delete process.env.NASA_FIRMS_MAP_KEY;

      // app import 시 config.ts가 Supabase 설정을
      // 즉시 검증하므로 테스트용 값 지정 후 동적 import
      process.env.SUPABASE_URL =
        previous.supabaseUrl ??
        "https://example.supabase.co";

      process.env.SUPABASE_SECRET_KEY =
        previous.supabaseSecret ??
        "test-secret-key";

      const { app } =
        await import("../src/app.js");

      const response = await app.request(
        "http://localhost/api/v1/external/wildfire/firms",
        {
          headers: {
            Origin:
              "https://wildfire.forest.tobeunicorn.kr",
          },
        },
      );

      assert.equal(response.status, 502);

      assert.equal(
        response.headers.get(
          "Access-Control-Allow-Origin",
        ),
        "https://wildfire.forest.tobeunicorn.kr",
      );
    } finally {
      if (previous.nasa === undefined) {
        delete process.env.NASA_FIRMS_MAP_KEY;
      } else {
        process.env.NASA_FIRMS_MAP_KEY =
          previous.nasa;
      }

      if (
        previous.supabaseUrl ===
        undefined
      ) {
        delete process.env.SUPABASE_URL;
      } else {
        process.env.SUPABASE_URL =
          previous.supabaseUrl;
      }

      if (
        previous.supabaseSecret ===
        undefined
      ) {
        delete process.env.SUPABASE_SECRET_KEY;
      } else {
        process.env.SUPABASE_SECRET_KEY =
          previous.supabaseSecret;
      }
    }
  },
);
