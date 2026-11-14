# FieldLink LAN Messenger

FieldLink는 백홀 연결이 없는 현장 LAN에서 동작하는
현장 메시징 및 경보 전달 서비스입니다.

## 역할

- 현장 LAN 채팅
- GCS Station / 지휘 워크스테이션 메시지 공유
- 통합관제 경보 전달
- 현장 수신자 ACK
- 전달/확인 성공률 계산
- 로컬 파일 영속화

클라우드 연결이나 Supabase는 필요하지 않습니다.

## 기본 포트

TCP 18080

서비스는 0.0.0.0에 바인딩되어 동일 LAN의 다른 PC에서도 접근할 수 있습니다.

## 실행

macOS / Linux:

    FIELDLINK_PIN=1234 npm run fieldlink

Windows:

    set FIELDLINK_PIN=1234
    fieldlink-start.bat

## API

- GET /health
- POST /api/v1/presence
- GET /api/v1/presence/summary
- GET /api/v1/chat/messages
- POST /api/v1/chat/messages
- GET /api/v1/alerts
- POST /api/v1/alerts
- POST /api/v1/alerts/:deliveryId/ack
- GET /api/v1/alerts/summary

## 용어

- GCS Station: Mission Planner 등 드론 지상통제 시스템
- GCS Workstation: GCS Station과 현장 프로그램을 실행하는 Windows PC
- Telemetry Uplink Agent: MAVLink/RTSP 데이터를 전달하는 백그라운드 프로그램
- FieldLink LAN Messenger: LAN 채팅 및 경보 전달 서비스
- Core Server: 관제 데이터 수집/처리 서버
- Dashboard: 통합 관제 UI

## 보안

폐쇄 LAN에서도 운영 시 FIELDLINK_PIN 설정을 권장합니다.

실제 운영 PIN 값은 저장소에 커밋하지 않습니다.
