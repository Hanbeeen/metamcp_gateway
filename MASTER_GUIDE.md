# MetaMCP Gateway 실행 및 테스트 마스터 가이드

이 가이드는 소스 코드를 처음 받은 상태에서 MetaMCP Gateway를 실행하고, Notion 연동 및 IPI(프롬프트 주입) 감지 기능을 테스트하는 모든 과정을 단계별로 설명합니다.

## 1. 필수 준비 사항 (Prerequisites)

시작하기 전에 다음 도구들이 설치되어 있어야 합니다.
- **Docker & Docker Compose:** 컨테이너 실행을 위해 필수입니다.
- **Node.js (v20 이상):** 스크립트 실행 및 패키지 관리에 필요합니다.
- **pnpm:** 패키지 매니저 (`npm install -g pnpm`으로 설치).
- **Cursor:** MCP 서버를 테스트할 AI 코드 에디터.

## 2. 초기 설정 (Setup)

### 2.1. 환경 변수 설정
프로젝트 루트 디렉토리에 `.env` 파일이 필요합니다. `.env.example`이 있다면 복사해서 사용하세요.
```bash
cp .env.example .env
```
`.env` 파일 내의 `DATABASE_URL` 등은 Docker 실행 시 자동으로 처리되므로 기본값을 유지해도 좋지만, **Notion API 테스트를 위해 Notion API Key가 있다면 준비해 두세요.**

### 2.2. Docker 컨테이너 실행
프로젝트 루트에서 다음 명령어를 실행하여 백엔드와 데이터베이스를 실행합니다.
```bash
docker-compose up --build
```
- 처음 실행 시 이미지를 다운로드하고 빌드하느라 시간이 걸릴 수 있습니다.
- `metamcp-dev` 컨테이너 로그에 `✅ Migrations applied successfully`와 `Server is running on port 12009`가 뜨면 준비 완료입니다.

## 3. Notion 연동 테스트 (Cursor 연결)

### 3.1. Notion MCP 서버 등록
1. 브라우저에서 `http://localhost:12008` (프론트엔드)에 접속합니다.
2. **MCP Servers** 메뉴로 이동하여 **Add Server**를 클릭합니다.
3. **Notion** 서버를 선택하거나 정보를 입력합니다.
    - **Type:** `STDIO`
    - **Command:** `npx`
    - **Args:** `-y @notionhq/notion-mcp-server`
    - **Environment Variables:**
        - `NOTION_API_KEY`: (본인의 Notion API Key 입력)
4. 저장(Save)합니다.

### 3.2. Cursor에 연결
1. **Cursor**를 엽니다.
2. `Cmd + Shift + J`를 눌러 **Cursor Settings** > **Features** > **MCP**로 이동합니다.
3. **Add New MCP Server**를 클릭합니다.
    - **Name:** `metamcp-notion` (원하는 이름)
    - **Type:** `SSE`
    - **URL:** `http://localhost:12009/metamcp/notion/sse` (서버 이름이 `notion`인 경우)
4. 연결이 성공하면 초록색 불이 들어옵니다.

### 3.3. 동작 확인
Cursor의 Chat 창(`Cmd + L`)에서 다음을 입력해 봅니다.
> "Notion에서 내 정보를 가져와줘" 또는 "Notion 페이지 검색해줘"

Notion API가 정상적으로 호출되고 결과가 응답오면 성공입니다.

## 4. IPI (프롬프트 주입) 감지 테스트

MetaMCP는 악의적인 명령어나 민감한 정보 유출을 감지하는 IPI 미들웨어를 내장하고 있습니다.

### 4.1. 감지 트리거 (테스트용)
현재 설정에서는 **"ATTACK"** 이라는 키워드가 포함된 응답이 오면 감지하도록 설정되어 있습니다.

1. Cursor Chat에서 Notion(또는 다른 툴)에게 다음과 같이 요청하여 강제로 "ATTACK" 단어가 포함된 결과를 유도합니다.
    > "Notion에 'ATTACK'이라는 단어가 포함된 페이지를 검색해줘"
    > (또는 단순히 에코 툴이 있다면 "ATTACK"을 출력하게 함)

2. 만약 툴 실행 결과에 "ATTACK"이 포함되어 있다면, MetaMCP가 이를 감지하고 차단하거나 경고를 보냅니다.

### 4.2. 감지 결과 확인 및 조치
1. 브라우저에서 `http://localhost:12008/ipi-detection` 페이지로 이동합니다.
2. 방금 발생한 감지 로그가 리스트에 나타납니다.
3. 해당 로그를 클릭하여 상세 내용을 확인하고, **Block(차단)**, **Mask(마스킹)**, **Allow(허용)** 중 하나를 선택하여 조치할 수 있습니다.

## 5. 문제 해결 (Troubleshooting)

### Q1. DB 연결 오류 (`ECONNREFUSED 127.0.0.1:9433`)
- **원인:** Docker 컨테이너가 호스트의 로컬 주소로 접속하려 해서 발생합니다.
- **해결:** 이미 `docker-compose.yml`과 `docker-entrypoint-dev.sh`에 패치가 적용되어 있습니다. 컨테이너를 완전히 껐다 켜보세요.
    ```bash
    docker-compose down
    docker-compose up
    ```

### Q2. Notion 401 Unauthorized 오류
- **원인:** API Key가 없거나, 잘못된 환경 변수 이름(`API_KEY`)으로 저장된 경우입니다.
- **해결:** 백엔드 컨테이너 내부에서 수정 스크립트를 실행합니다.
    1. 새 터미널을 열고 프로젝트 루트로 이동.
    2. 다음 명령어 실행:
       ```bash
       # 백엔드 컨테이너 내부에서 스크립트 실행
       docker exec -it metamcp npx tsx src/scripts/fix-notion-env-var.ts
       ```
    3. 스크립트가 `NOTION_API_KEY`와 `NOTION_TOKEN`을 자동으로 설정해 줍니다.

### Q3. Cursor 연결 실패 (404/405 Error)
- **원인:** Cursor가 SSE 연결 시 `POST` 요청을 보내는 경우가 있습니다.
- **해결:** 이미 백엔드에 패치가 적용되어 있습니다. URL이 정확한지(`.../sse`) 확인하고, Cursor를 재시작해 보세요.

---
**이제 MetaMCP Gateway를 자유롭게 활용해 보세요!**
추가적인 질문이 있다면 언제든 물어봐 주세요.
