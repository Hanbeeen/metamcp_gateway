# 변경 사항 로그 (Comprehensive Changelog)

이 문서는 프로젝트 진행 과정에서 수정하거나 추가된 **모든 파일과 로직**을 상세하게 기록한 문서입니다.

## 1. 백엔드 (Backend)

### 🛠️ 핵심 로직 및 유틸리티 (Core Logic & Utils)
- **`apps/backend/src/lib/metamcp/utils.ts`**
    - **변경 내용:** `resolveEnvVariables` 함수 개선.
    - **상세:** 환경 변수 값의 앞뒤 공백을 자동으로 제거(`trim`)하는 로직을 추가하여, `.env` 파일이나 DB에 저장된 키 값에 실수로 포함된 공백으로 인한 인증 오류를 방지했습니다.

- **`apps/backend/src/lib/metamcp/client.ts`**
    - **변경 내용:** 프로세스 실행 전 디버그 로그 추가.
    - **상세:** `createMetaMcpClient` 함수 내에 `NOTION_API_KEY` 등의 환경 변수가 실제 프로세스로 전달되기 직전의 상태(길이, 공백 여부 등)를 출력하는 로그를 추가하여 디버깅을 용이하게 했습니다.

- **`apps/backend/src/routers/mcp-proxy/server.ts`**
    - **변경 내용:** `extractServerUuidFromStdioCommand` 함수 매칭 로직 개선.
    - **상세:** 기존에는 명령어의 절대 경로가 정확히 일치해야만 서버를 찾을 수 있었으나, 실행 파일명(basename)만으로도 매칭되도록 수정하여 개발/배포 환경 간 경로 차이로 인한 "No server found" 오류를 해결했습니다.

### 🌐 라우터 및 API (Routers & API)
- **`apps/backend/src/routers/public-metamcp/sse.ts`**
    - **변경 내용:** `POST /:endpoint_name/sse` 엔드포인트 핸들러 추가.
    - **상세:** Cursor 등 일부 클라이언트가 SSE 연결을 위해 `POST` 요청을 보낼 경우 404 오류가 발생하던 문제를 해결하기 위해, 405 Method Not Allowed 응답과 함께 "GET 요청을 사용하거나 /mcp 엔드포인트를 사용하라"는 명확한 가이드를 반환하도록 수정했습니다.

### 🛡️ 미들웨어 (Middleware)
- **`apps/backend/src/lib/metamcp/metamcp-middleware/ipi-detection.middleware.ts`**
    - **변경 내용:** IPI(프롬프트 주입) 감지 로직 구현 및 검증.
    - **상세:** 툴 실행 결과에 "ATTACK"이나 "SECRET"과 같은 민감한 키워드가 포함되어 있는지 검사하고, 감지 시 `ipiDecisionStore`를 통해 차단(Block), 마스킹(Mask), 허용(Allow) 등의 조치를 취할 수 있는 모의(Mock) 로직을 통합했습니다.

### 🗄️ 데이터베이스 및 설정 (Database & Config)
- **`apps/backend/src/db/index.ts`**
    - **변경 내용:** DB 연결 문자열 우선순위 로직 변경.
    - **상세:** `INTERNAL_DATABASE_URL` 환경 변수가 존재할 경우 `DATABASE_URL`보다 우선적으로 사용하도록 수정하여, Docker 컨테이너 내부에서 호스트의 `.env` 설정(localhost)에 영향받지 않고 내부 네트워크 주소로 연결되도록 보장했습니다. 또한 연결 주소를 마스킹하여 로그에 출력하는 기능을 추가했습니다.

- **`apps/backend/drizzle.config.ts`**
    - **변경 내용:** 마이그레이션 설정 수정.
    - **상세:** `drizzle-kit` 실행 시에도 `INTERNAL_DATABASE_URL`을 우선 사용하도록 설정하여, 마이그레이션 도구가 올바른 DB를 타겟팅하도록 했습니다.

### 📜 스크립트 (Scripts - New)
- **`apps/backend/src/scripts/debug-notion-token.ts`** (신규)
    - **내용:** DB에 저장된 Notion 서버 설정 조회 스크립트.
    - **상세:** `mcp_servers` 테이블과 `oauth_sessions` 테이블을 조회하여 Notion 관련 API 키나 토큰이 실제로 어떻게 저장되어 있는지(공백 포함 여부, 키 이름 등)를 검사합니다.

- **`apps/backend/src/scripts/fix-notion-env-var.ts`** (신규)
    - **내용:** Notion 환경 변수 이름 자동 수정 스크립트.
    - **상세:** 사용자가 `API_KEY`라는 이름으로 잘못 저장한 환경 변수를 감지하여, Notion MCP 서버가 인식할 수 있는 `NOTION_API_KEY`와 `NOTION_TOKEN`으로 이름을 변경하고 값을 복사해 주는 마이그레이션 스크립트입니다.

## 2. 프론트엔드 (Frontend)

### 🔐 인증 및 세션 (Auth & Session)
- **`apps/frontend/lib/oauth-provider.ts`**
    - **변경 내용:** SSR(Server-Side Rendering) 호환성 수정.
    - **상세:** `sessionStorage`는 브라우저 전용 API이므로 서버에서 실행될 때 `ReferenceError`가 발생하지 않도록 `typeof window !== 'undefined'` 조건문을 추가하여 감쌌습니다.

### 🖥️ UI 컴포넌트 (UI Components)
- **`apps/frontend/app/[locale]/(sidebar)/ipi-detection/page.tsx`** (신규/수정)
    - **내용:** IPI 감지 로그 및 관리 페이지.
    - **상세:** 감지된 IPI 로그 목록을 보여주고, 각 항목에 대해 차단/마스킹/허용 조치를 취할 수 있는 관리자 인터페이스를 구현했습니다.

- **`apps/frontend/components/edit-mcp-server.tsx`** (수정)
    - **내용:** 서버 설정 UI 개선.
    - **상세:** (문맥상) IPI 감지 기능 활성화 여부나 관련 설정을 할 수 있는 UI 요소가 추가/수정되었습니다.

## 3. 인프라 및 배포 설정 (Infrastructure)

- **`docker-compose.yml`**
    - **변경 내용:** `app` 서비스 네트워크 설정 강화.
    - **상세:** `INTERNAL_DATABASE_URL` 환경 변수를 추가하고 `POSTGRES_HOST`를 `postgres`로 하드코딩하여, 백엔드 컨테이너가 호스트의 로컬 설정과 무관하게 항상 Docker 내부 네트워크를 통해 DB에 접속하도록 강제했습니다.

- **`docker-entrypoint-dev.sh`**
    - **변경 내용:** 마이그레이션 실행 전 환경 변수 강제 설정.
    - **상세:** `drizzle-kit migrate` 명령어를 실행하기 직전에 `export DATABASE_URL=...`을 통해 내부 DB 주소를 명시적으로 선언함으로써, `drizzle-kit`이 `.env` 파일을 로드하여 설정을 덮어쓰는 문제를 원천 차단했습니다.
