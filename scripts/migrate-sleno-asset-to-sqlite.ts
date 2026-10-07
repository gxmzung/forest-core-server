import {
  copyFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";

import {
  dirname,
  resolve,
} from "node:path";

type Mapping = {
  vendor_code: string;
  vendor_device_id: string;
  asset_id: string;
  device_type: string | null;
  status: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
};

type Asset = {
  asset_id: string;
  asset_code: string;
  asset_name: string | null;
  status: string;
  product_name?: string | null;
  model_name?: string | null;
  specifications?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;

  asset_type: {
    asset_type_id: string;
    name: string;
    description: string | null;
    enabled: boolean;
  };

  vendor_mappings?: Mapping[];
};

function arg(
  name: string,
  fallback: string,
): string {
  const inline =
    process.argv.find(
      (value) =>
        value.startsWith(
          `${name}=`,
        ),
    );

  if (inline) {
    return inline.slice(
      name.length + 1,
    );
  }

  const index =
    process.argv.indexOf(name);

  if (
    index >= 0 &&
    process.argv[index + 1] &&
    !process.argv[index + 1]
      .startsWith("--")
  ) {
    return process.argv[
      index + 1
    ];
  }

  return fallback;
}

async function get<T>(
  base: string,
  path: string,
): Promise<T> {
  const response =
    await fetch(
      `${base}${path}`,
      {
        headers: {
          accept:
            "application/json",
        },
      },
    );

  if (!response.ok) {
    throw new Error(
      `GET ${path}: HTTP ${response.status}`,
    );
  }

  return (await response.json()) as T;
}

const usage = `Usage:
  npx tsx scripts/migrate-sleno-asset-to-sqlite.ts [options]

Options:
  --source-base-url <url>  Source Core API base URL
  --asset-code <code>      Physical Sleno asset code
  --target <path>          Target SQLite database path
  --apply                  Apply migration (default is dry-run)
  --help                   Show this help
`;

const knownOptions = new Set([
  "--source-base-url",
  "--asset-code",
  "--target",
  "--apply",
  "--help",
]);

for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];

  if (!value.startsWith("--")) {
    continue;
  }

  if (!knownOptions.has(value)) {
    throw new Error(
      `Unknown option: ${value}`,
    );
  }

  if (
    value === "--source-base-url" ||
    value === "--asset-code" ||
    value === "--target"
  ) {
    index += 1;
  }
}

if (process.argv.includes("--help")) {
  console.log(usage);
  process.exit(0);
}

const apply =
  process.argv.includes(
    "--apply",
  );

const base =
  arg(
    "--source-base-url",
    process.env
      .MIGRATION_SOURCE_BASE_URL ??
      "https://api.forest.tobeunicorn.kr",
  ).replace(/\/$/, "");

const assetCode =
  arg(
    "--asset-code",
    "SLENO_Lab_SingleCH",
  );

const target =
  resolve(
    arg(
      "--target",
      process.env.SQLITE_PATH ??
        "./data/forest.sqlite",
    ),
  );

/*
 * Source는 현재 운영 Core API를
 * GET으로만 조회한다.
 */
const list =
  await get<{
    data: Asset[];
  }>(
    base,
    "/api/v1/dashboard/assets?limit=200",
  );

const matches =
  list.data.filter(
    (asset) =>
      asset.asset_code ===
      assetCode,
  );

if (matches.length !== 1) {
  throw new Error(
    `asset_code=${assetCode}: expected 1 match, got ${matches.length}`,
  );
}

const listed =
  matches[0];

const mappings =
  (
    listed.vendor_mappings ??
    []
  ).filter(
    (mapping) =>
      mapping.vendor_code ===
      "JININFRA",
  );

/*
 * SQLite asset schema는 현재
 * 업체 mapping 1개를 inline으로
 * 보관하므로 다중 mapping이면
 * 자동 이관하지 않는다.
 */
if (mappings.length !== 1) {
  throw new Error(
    `JININFRA mapping: expected 1, got ${mappings.length}`,
  );
}

const mapping =
  mappings[0];

const detail =
  await get<{
    data: Asset;
  }>(
    base,
    `/api/v1/dashboard/assets/${encodeURIComponent(listed.asset_id)}`,
  );

const asset =
  detail.data;

if (
  asset.asset_id !==
    listed.asset_id ||
  asset.asset_code !==
    listed.asset_code
) {
  throw new Error(
    "asset list/detail identity mismatch",
  );
}

if (
  !asset.created_at ||
  !asset.updated_at
) {
  throw new Error(
    "source asset timestamps are missing",
  );
}

/*
 * SIM 장비를 실물 Sleno 이관으로
 * 잘못 넣는 것을 차단한다.
 */
if (
  /^SIM-/i.test(
    asset.asset_code,
  ) ||
  /^SIM-/i.test(
    mapping.vendor_device_id,
  ) ||
  asset.specifications
    ?.synthetic === true
) {
  throw new Error(
    "refusing to migrate simulated asset",
  );
}

/*
 * Dashboard source implementations may expose
 * asset_type either as a string identifier or
 * as an expanded asset-type object.
 *
 * Normalize both representations before writing
 * to SQLite so migration does not bind undefined.
 */
const sourceAssetType =
  asset.asset_type;

const normalizedAssetType =
  typeof sourceAssetType === "string"
    ? {
        asset_type_id:
          sourceAssetType,

        name:
          sourceAssetType,

        description:
          null,

        enabled:
          true,
      }
    : sourceAssetType;

if (
  !normalizedAssetType ||
  typeof normalizedAssetType.asset_type_id !==
    "string" ||
  normalizedAssetType.asset_type_id.trim() === ""
) {
  throw new Error(
    "source asset_type is missing or invalid",
  );
}

const plan = {
  mode:
    apply
      ? "APPLY"
      : "DRY_RUN",

  sourceBaseUrl:
    base,

  targetPath:
    target,

  asset: {
    asset_id:
      asset.asset_id,

    asset_code:
      asset.asset_code,

    asset_name:
      asset.asset_name,

    status:
      asset.status,

    product_name:
      asset.product_name ??
      null,

    model_name:
      asset.model_name ??
      null,

    specifications:
      asset.specifications ??
      {},

    created_at:
      asset.created_at,

    updated_at:
      asset.updated_at,
  },

  assetType:
    normalizedAssetType,

  mapping,
};

console.log(
  "===== SLENO SQLITE MIGRATION PLAN =====",
);

console.log(
  JSON.stringify(
    plan,
    null,
    2,
  ),
);

/*
 * 기본 동작은 무조건 DRY RUN.
 */
if (!apply) {
  console.log(
    "\nDRY RUN ONLY - no SQLite file was changed.",
  );

  console.log(
    "Re-run with --apply after reviewing this plan.",
  );

  process.exit(0);
}

/*
 * 여기 아래부터만 실제 write.
 */
mkdirSync(
  dirname(target),
  {
    recursive: true,
  },
);

let backupPath:
  string | null =
  null;

if (existsSync(target)) {
  backupPath =
    `${target}.bak.${new Date()
      .toISOString()
      .replace(
        /[:.]/g,
        "-",
      )}`;

  copyFileSync(
    target,
    backupPath,
  );

  console.log(
    `BACKUP: ${backupPath}`,
  );
}

/*
 * 현재 Core가 사용하는 localDb()
 * 자체로 schema를 초기화한다.
 * 별도 schema 복제 방지.
 */
process.env.DB_MODE =
  "sqlite";

process.env.SQLITE_PATH =
  target;

process.env.SQLITE_SEED_DEMO =
  "false";

delete process.env
  .SUPABASE_URL;

delete process.env
  .SUPABASE_SECRET_KEY;

const {
  localDb,
} = await import(
  "../src/local-demo/db.js"
);

const db =
  localDb();

/*
 * 같은 asset_code가 다른 UUID로
 * 존재하면 덮어쓰지 않는다.
 */
const codeConflict =
  db.prepare(`
    SELECT
      asset_id,
      asset_code
    FROM asset
    WHERE asset_code = ?
      AND asset_id <> ?
    LIMIT 1
  `).get(
    asset.asset_code,
    asset.asset_id,
  );

if (codeConflict) {
  throw new Error(
    `target asset_code conflict: ${JSON.stringify(codeConflict)}`,
  );
}

/*
 * 같은 업체 장비 ID가 다른 asset에
 * 연결돼 있어도 중단.
 */
const mappingConflict =
  db.prepare(`
    SELECT
      asset_id,
      vendor_code,
      vendor_device_id
    FROM asset
    WHERE vendor_code = ?
      AND vendor_device_id = ?
      AND asset_id <> ?
    LIMIT 1
  `).get(
    mapping.vendor_code,
    mapping.vendor_device_id,
    asset.asset_id,
  );

if (mappingConflict) {
  throw new Error(
    `target vendor mapping conflict: ${JSON.stringify(mappingConflict)}`,
  );
}

db.exec(
  "BEGIN IMMEDIATE",
);

try {
  db.prepare(`
    INSERT INTO asset_type (
      asset_type_id,
      name,
      description,
      enabled
    )
    VALUES (?, ?, ?, ?)

    ON CONFLICT(asset_type_id)
    DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      enabled = excluded.enabled
  `).run(
    normalizedAssetType
      .asset_type_id,

    normalizedAssetType.name,

    normalizedAssetType
      .description ?? null,

    normalizedAssetType.enabled === false
      ? 0
      : 1,
  );

  db.prepare(`
    INSERT INTO asset (
      asset_id,
      asset_type_id,
      asset_code,
      asset_name,
      status,
      product_name,
      model_name,
      specifications_json,
      vendor_code,
      vendor_device_id,
      device_type,
      mapping_status,
      created_at,
      updated_at
    )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?
    )

    ON CONFLICT(asset_id)
    DO UPDATE SET
      asset_type_id =
        excluded.asset_type_id,

      asset_code =
        excluded.asset_code,

      asset_name =
        excluded.asset_name,

      status =
        excluded.status,

      product_name =
        excluded.product_name,

      model_name =
        excluded.model_name,

      specifications_json =
        excluded.specifications_json,

      vendor_code =
        excluded.vendor_code,

      vendor_device_id =
        excluded.vendor_device_id,

      device_type =
        excluded.device_type,

      mapping_status =
        excluded.mapping_status,

      created_at =
        excluded.created_at,

      updated_at =
        excluded.updated_at
  `).run(
    asset.asset_id,

    normalizedAssetType
      .asset_type_id,

    asset.asset_code,

    asset.asset_name,

    asset.status,

    asset.product_name ??
      null,

    asset.model_name ??
      null,

    JSON.stringify(
      asset.specifications ??
        {},
    ),

    mapping.vendor_code,

    mapping.vendor_device_id,

    mapping.device_type,

    mapping.status ??
      "ACTIVE",

    asset.created_at,

    asset.updated_at,
  );

  db.exec(
    "COMMIT",
  );
} catch (error) {
  db.exec(
    "ROLLBACK",
  );

  throw error;
}

const migrated =
  db.prepare(`
    SELECT
      a.asset_id,
      a.asset_code,
      a.asset_name,
      a.status,
      a.product_name,
      a.model_name,
      a.specifications_json,
      a.vendor_code,
      a.vendor_device_id,
      a.device_type,
      a.mapping_status,
      a.created_at,
      a.updated_at,
      t.asset_type_id,
      t.name
        AS asset_type_name,
      t.enabled
        AS asset_type_enabled
    FROM asset a
    JOIN asset_type t
      ON t.asset_type_id =
         a.asset_type_id
    WHERE a.asset_id = ?
    LIMIT 1
  `).get(
    asset.asset_id,
  );

if (!migrated) {
  throw new Error(
    "post-migration verification failed",
  );
}

console.log(
  "\n===== MIGRATED RECORD =====",
);

console.log(
  JSON.stringify(
    migrated,
    null,
    2,
  ),
);

console.log(
  "\n===== MIGRATION RESULT =====",
);

console.log(
  JSON.stringify(
    {
      ok: true,
      targetPath:
        target,

      backupPath,

      assetId:
        asset.asset_id,

      assetCode:
        asset.asset_code,

      vendorDeviceId:
        mapping.vendor_device_id,
    },
    null,
    2,
  ),
);
