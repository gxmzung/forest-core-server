# Local SQLite Dashboard Demo

## Purpose

Supabase가 없는 로컬 PC에서도
산불·산사태 통합관제 Dashboard API를
실행하기 위한 데모 모드입니다.

운영과 로컬 DB는 명시적으로 분리됩니다.

- 운영: DB_MODE=supabase
- 로컬: DB_MODE=sqlite

자동 cloud fallback, failover,
Supabase-SQLite 동기화는 구현하지 않습니다.

## Run

npm run local-demo

기본 DB:

./data/forest-local-demo.sqlite

## Frontend

forest-front-wildfire의 .env.local:

VITE_DASHBOARD_API_BASE_URL=http://127.0.0.1:18020

그 후:

npm run dev

## Health

GET http://127.0.0.1:18020/health

SQLite 모드 확인값:

- database = SQLITE
- dbMode = sqlite
- demoMode = true
- cloudFallback = false
- cloudFailover = false

## Local Dashboard APIs

- GET /api/v1/dashboard/asset-types
- GET /api/v1/dashboard/assets
- POST /api/v1/dashboard/assets
- GET /api/v1/dashboard/assets/:assetId
- GET /api/v1/dashboard/assets/:assetId/logs
- PUT /api/v1/dashboard/assets/:assetId/vendor-mappings
- GET /api/v1/dashboard/disasters/:disasterId/assets
- GET /api/v1/dashboard/network-quality/sleno
- GET /api/v1/dashboard/telemetry/drones

## Demo Data

SQLite 시작 시 다음 seed가 생성됩니다.

- UAV
- Sleno terminal
- 산불 상황
- 상황-장비 배정
- frameCounter
- RSSI
- SNR
- RTK telemetry

모든 로컬 데모 값은
synthetic=true 또는 LOCAL_SQLITE_DEMO로
실제 장비 데이터와 구분합니다.
