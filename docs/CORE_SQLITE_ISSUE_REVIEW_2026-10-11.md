# Forest Core / JININFRA / SQLite 장애 분석 기록

- 작성 기준: 2026-10-11
- 상태: **사후 코드 분석; 운영 장애의 단일 근본 원인 미확정**
- 대상: `sonjh-github/forest-core-server` 및 `gxmzung/forest-core-server`
- 운영 서버/DB 변경: 없음

## 1. 관측 사실

1. 프론트 브라우저에서 `risk`, `forecast`, `history`, `regional-risk` 요청이 HTTP **502**로 관측됨. 이들 요청의 정확한 목적지와 Core 인덱스 문제의 인과관계는 미확인.
2. Core 운영 API 대상으로 실제 재조회한 결과 `/` HTTP **200**(약 0.059초), `/api/v1/assets?limit=1` **404**(약 0.027초), `/api/v1/dashboard/assets?limit=1` **200**(약 0.031초), `/api/v1/dashboard/asset-types` **200**(약 0.034초). 이 시점의 응답시간은 정상 범위로 보이나 전반적 SLA 판단 자료는 아님.
3. 프론트 `forestApi.assets()`는 `/api/v1/assets?limit=${limit}`를 사용하고 있었음. 운영 Core는 `/api/v1/dashboard/assets`에서 `{ data: [...] }`를 반환함. **자산 GET 경로 불일치는 확인됨.** 이 경로 차이만으로 최초 전체 화면 실패의 유일한 원인임을 입증하지는 못함.
4. 10월 8일 Ingress/DB 교차검증은 캡처한 HTTP 78건 모두 SQLite 저장기록과 대조되는 사실을 확인함. 해당 구간의 RTK_FLOAT 58건에서 frameCounter 850은 미관측되었으나, 송신 누락/무선 구간 유실/업체 귀책은 판정 불가.

## 2. 10월 11일 Core 코드 변경의 의미

### `575232452850f51589c5af1d5176bd0acf859442` — 최근 업체 텔레메트리 조회 최적화

- 파일: `src/local-demo/db.ts`, `test/local-sqlite-demo.test.ts`
- SQLite `vendor_message`에 다음 부분 인덱스를 추가:

```sql
CREATE INDEX IF NOT EXISTS idx_vendor_message_vendor_occurred
ON vendor_message(vendor_code, occurred_at DESC)
WHERE status = 'PERSISTED';

CREATE INDEX IF NOT EXISTS idx_vendor_message_vendor_payload_occurred
ON vendor_message(vendor_code, payload_type, occurred_at DESC)
WHERE status = 'PERSISTED';
```

- JININFRA의 최근 저장 이벤트 및 RTK_POSITION 조회에 필요한 업체·종류 필터와 발생시간 역순 정렬을 지원함.
- 추가된 테스트는 `EXPLAIN QUERY PLAN`을 사용해 해당 테스트 쿼리가 인덱스를 사용하고 `SCAN vendor_message`/`TEMP B-TREE`를 사용하지 않는지 검사함.
- **해석:** 인덱스 미비로 인한 대량 검색·정렬 부담이 Core 지연의 *유력한 원인 후보*였음을 뒷받침함. 운영 DB 실제 실행계획, 배포 전후 쿼리시간, 요청 타임아웃 로그가 없으므로 운영 장애 원인이 이것 하나였다고 확정하지 않음.

### `a3a27fcd59a902c061614c9e3474c2bba06dc44f` — 장비 등록·업체 매핑 검증 보강

- 관련 파일: `src/dashboard/registry.ts`, `src/dashboard/routes.ts`, `src/db/asset-registry.ts`, `src/local-demo/db.ts`, `src/local-demo/routes.ts`, 관련 테스트·문서.
- JSON 요청 본문의 비정상 형식을 HTTP 400으로 처리.
- 동일 업체 장비 ID가 다른 자산으로 연결되는 것을 방지하여 충돌 시 HTTP 409로 응답.
- 자산 상세 응답에 `vendor_mappings` 포함.
- 대시보드의 장비 등록 완료와 Vendor 실시간 수신 준비를 별도 상태로 구분.
- **해석:** 장비 등록 및 매핑 정합성을 보완한 변경. `GET /api/v1/assets` 404의 직접 해결 패치가 아니며 frameCounter 불연속 수정도 아님.

## 3. 분리해야 할 오류

| 현상 | 판단 | 추가 근거 |
|---|---|---|
| 최신 JININFRA 로그 조회 지연 | SQLite 인덱스 부족 가능성 높음 | 운영 `EXPLAIN QUERY PLAN`, 전후 latency 및 서버 로그 |
| `/api/v1/assets` HTTP 404 | **확인된 API 경로 불일치** | Core 라우트 및 200 응답 비교 |
| 외부 재난 API 502 | 미확정 | 정확한 Request URL, 상류 서비스 로그 |
| RTK frameCounter 불연속 | 원인 미확정 | 장비 원천 송신 로그/게이트웨이 기록과 시각 정합성 비교 |
| 프론트 `Failed to fetch` 전체 실패 | 다중 요청 실패 또는 오류 전파 가능성 | 같은 시각 브라우저 Network와 Core 요청 로그 |

## 4. 자체 저장소와 최신 본류 차이

- 개인 fork `gxmzung/forest-core-server`의 2026-10-11 조회 기준 최신 검색 커밋: `1a779c01c062a31eabbb9013065fb61b7667616d`.
- 본류 `sonjh-github/forest-core-server` 최신: `575232452850f51589c5af1d5176bd0acf859442`.
- GitHub compare API: **본류가 개인 fork의 위 커밋보다 41커밋 앞서고, 뒤처진 커밋은 0개**. 이는 조회된 두 SHA 간 비교임. 개인 fork `main`에 본류 최신 수정이 자동 반영되었다고 가정하면 안 됨.
- 첨부된 `forest-core-server-main (9).zip`은 `5752324` 기준 소스 아카이브였으며, 이 파일에서 두 인덱스와 테스트 코드를 확인함.

## 5. 재발 시 초기 대응 순서

1. 브라우저 오류 요청을 **URL/HTTP 상태/시간**으로 분리하고 `404`와 `502/504`를 동일 원인으로 취급하지 않기.
2. Core 정상 엔드포인트와 호출 경로를 비교하기. 경로 문제는 프론트 라우팅, 성능 문제는 Core/SQLite 담당 영역으로 분리.
3. 서버 데이터 조회 지연은 운영 읽기 전용 쿼리 계획, 요청 처리시간, SQL 인덱스 여부로 확인. 운영 DB 변경 전 책임자 승인.
4. 장비 원천 frameCounter 검증은 Ingress PCAP, DB 이벤트, 장비 송신 기록의 동일 기간을 대조. 서버 저장 성공과 무선 무손실을 혼동하지 않기.
5. 회귀 확인 후 수정사항을 PR로 제출하고, 운영 배포/실측 성능은 별도 기록.

## 6. 원본 근거

- Core commit 1: https://github.com/sonjh-github/forest-core-server/commit/a3a27fcd59a902c061614c9e3474c2bba06dc44f
- Core commit 2: https://github.com/sonjh-github/forest-core-server/commit/575232452850f51589c5af1d5176bd0acf859442
- Personal fork: https://github.com/gxmzung/forest-core-server
- 이전 검증 보고서: `JININFRA_LPWA_Verification_Report_20261009.pdf` (사용자 제공)
- HTTP 관측값 및 프론트 diff: 2026-10-11 사용자 제공 터미널 기록

> 문서의 확정 범위: **코드 변경 내용 및 수집된 HTTP 상태**. 장애의 전체 원인, 운영 반영, 개선 효과, 진인프라 원천 전송 장애 귀책은 아직 최종 실측 검증하지 않음.
