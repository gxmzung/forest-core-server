import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import {
  config,
} from "../config.js";

let client:
  SupabaseClient | null =
  null;

function activeClient():
  SupabaseClient {
  if (
    config.dbMode !==
    "supabase"
  ) {
    throw new Error(
      "DB_MODE=sqlite에서는 Supabase DB를 사용하지 않습니다.",
    );
  }

  if (!client) {
    client =
      createClient(
        config.supabaseUrl,
        config.supabaseSecretKey,
        {
          auth: {
            autoRefreshToken:
              false,

            persistSession:
              false,

            detectSessionInUrl:
              false,
          },

          global: {
            headers: {
              "X-Client-Info":
                "forest-core-server/hono",
            },
          },
        },
      );
  }

  return client;
}

/*
 * 기존 Supabase DB 모듈의 API를 깨지 않으면서
 * SQLite 모드에서는 Supabase client 생성을 지연한다.
 */
const proxyOverrides =
  {} as SupabaseClient;

/*
 * 테스트에서는 기존부터
 *
 * Object.assign(supabase, {
 *   schema: () => mock
 * })
 *
 * 형태로 Supabase를 대체한다.
 *
 * own property가 존재하면 실제 client보다
 * 테스트 override를 우선한다.
 */
export const supabase =
  new Proxy(
    proxyOverrides,
    {
      get(
        target,
        property,
        receiver,
      ) {
        if (
          Object.prototype
            .hasOwnProperty
            .call(
              target,
              property,
            )
        ) {
          return Reflect.get(
            target,
            property,
            receiver,
          );
        }

        const current =
          activeClient();

        const value =
          Reflect.get(
            current,
            property,
            current,
          );

        return typeof value ===
          "function"
          ? value.bind(current)
          : value;
      },

      set(
        target,
        property,
        value,
        receiver,
      ) {
        return Reflect.set(
          target,
          property,
          value,
          receiver,
        );
      },

      deleteProperty(
        target,
        property,
      ) {
        return Reflect.deleteProperty(
          target,
          property,
        );
      },
    },
  );
