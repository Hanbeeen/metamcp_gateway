# IPI Detection Implementation - Run & Test Guide

이 가이드는 `metamcp_gateway` 환경에서 IPI(Indirect Prompt Injection) 탐지 기능을 실행하고 테스트하는 방법을 설명합니다.
사용자의 환경에 따라 **옵션 A (로컬 실행)** 또는 **옵션 B (도커 실행)** 중 하나를 선택하여 진행하세요.

---

## 1. 공통 준비 사항 (Prerequisites)

어떤 방식으로 실행하든 다음 준비 과정은 필수입니다.

### 1.1 필수 도구 설치
- **Node.js** (v18 이상): [공식 홈페이지](https://nodejs.org/)에서 LTS 버전 설치
- **pnpm**: 터미널에서 `npm install -g pnpm` 명령어로 설치
- **Docker Desktop**: [공식 홈페이지](https://www.docker.com/products/docker-desktop/)에서 설치 및 실행

### 1.2 프로젝트 설정
터미널에서 `metamcp_gateway` 폴더로 이동하여 다음 명령어를 순서대로 실행합니다.

```bash
# 1. 의존성 설치 (로컬 실행 및 IDE 지원을 위해 필수)
pnpm install

# 2. 환경 변수 파일 생성
# .env: 도커 실행용
# .env.local: 로컬 실행용
cp example.env .env
cp example.env .env.local
```

---

## 2. 실행 방법 선택

### [옵션 A] 로컬에서 실행 (Local Development)
개발 속도가 빠르고 디버깅이 용이합니다. 데이터베이스만 도커로 띄우고, 앱은 로컬에서 실행합니다.

#### 1. 환경 변수 수정 (`.env.local`)
로컬에서 실행할 때는 도커 내부가 아니므로 `localhost`를 사용해야 합니다.
`.env.local` 파일을 열어 다음과 같이 수정하세요:

```env
# DB 호스트를 localhost로 변경
POSTGRES_HOST=localhost
# DB 포트를 외부 포트(9433)로 변경
POSTGRES_PORT=9433
```

#### 2. 데이터베이스 실행
데이터베이스 컨테이너만 백그라운드로 실행합니다.

```bash
docker compose -f docker-compose.dev.yml up -d postgres
```

#### 3. 데이터베이스 마이그레이션 (최초 1회)
데이터베이스 테이블을 생성하기 위해 마이그레이션을 실행합니다.

```bash
cd apps/backend
pnpm db:migrate:dev
cd ../..
```

#### 4. 앱 실행
로컬 개발 서버를 실행합니다.

```bash
pnpm dev
```

#### 4. 접속
브라우저에서 [http://localhost:12008](http://localhost:12008) 접속

---

### [옵션 B] 도커로 전체 실행 (Full Docker)
실제 배포 환경과 가장 유사합니다. 모든 서비스를 도커 컨테이너로 실행합니다.

#### 1. (중요) 기존 프로세스 종료
**주의:** 로컬 서버(`pnpm dev`)가 실행 중이라면 **반드시 종료**해야 합니다. (포트 12008 충돌 방지)
터미널에서 `Ctrl + C`를 눌러 종료하거나, 다음 명령어로 강제 종료하세요.

```bash
# 12008 포트를 사용하는 프로세스 확인 및 종료
lsof -i :12008
# PID를 확인 후 kill -9 [PID] (예: kill -9 1234)
```

#### 2. 도커 컨테이너 실행
앱과 데이터베이스를 모두 도커로 실행합니다.

```bash
# 빌드 및 백그라운드 실행
docker compose -f docker-compose.dev.yml up -d --build

# 로그 실시간 확인 (종료하려면 Ctrl + C)
docker compose -f docker-compose.dev.yml logs -f
```

#### 3. 접속
브라우저에서 [http://localhost:12008](http://localhost:12008) 접속

---

## 3. IPI 탐지 테스트 (Testing)

현재 IPI 탐지 미들웨어는 **"ATTACK"** 또는 **"SECRET"**이라는 키워드가 포함된 도구 실행 결과를 탐지하도록 설정되어 있습니다.

### 3.1 테스트 방법

1.  **도구 실행**: MetaMCP UI에서 아무 도구(Tool)나 실행합니다.
    *   입력값을 그대로 반환하는 도구가 있다면, 인자값에 `ATTACK` 또는 `SECRET`을 포함시킵니다.
    *   적절한 도구가 없다면 아래 **3.2 강제 탐지 테스트**를 참고하세요.

### 3.2 강제 탐지 테스트 (Forced Detection)

테스트할 도구가 마땅치 않은 경우, 코드를 잠시 수정하여 모든 도구 실행을 탐지하게 할 수 있습니다.
(`apps/backend/src/lib/metamcp/metamcp-middleware/ipi-detection.middleware.ts`)

```typescript
async function detectIPI(toolName: string, result: CallToolResult) {
    // 테스트를 위해 무조건 true 반환
    return {
        detected: true,
        reason: "Test Detection Triggered",
    };
}
```

### 3.3 UI 동작 확인

1.  **알림 확인**: 도구 실행 시 백엔드가 멈추고, 프론트엔드에 **"Security Alert"** 모달이 뜹니다.
2.  **동작 테스트**:
    *   **Block Execution**: 실행 차단 (에러 발생 확인)
    *   **Mask Sensitive Data**: 데이터가 `*** MASKED ***`로 변경되어 실행됨
    *   **Allow (Risk)**: 원본 데이터 그대로 실행됨

---

## 4. 문제 해결 (Troubleshooting)

**Q. `address already in use` 에러가 발생해요.**
A. 이미 해당 포트(12008)를 사용하는 프로세스가 있습니다.
   - 로컬 실행 중이라면 다른 터미널에서 `pnpm dev`가 켜져 있는지 확인하세요.
   - 도커 실행 중이라면 `docker ps`로 기존 컨테이너를 확인하고 `docker stop` 하세요.

**Q. `ENOTFOUND postgres` 에러가 발생해요.**
A. 로컬 실행(`pnpm dev`) 중인데 DB 호스트가 `postgres`(도커 내부용 이름)로 설정된 경우입니다.
   - `.env.local` 파일에서 `POSTGRES_HOST=localhost`로 설정되었는지 확인하세요.

**Q. `pnpm install` 시 에러가 발생해요.**
A. Node.js 버전이 낮을 수 있습니다. `node -v`로 v18 이상인지 확인하세요.
