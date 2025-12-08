# 🚀 MetaMCP Gateway: Zero to Hero 마스터 가이드

이 문서는 **MetaMCP Gateway** 프로젝트를 **처음부터(Zero) 실행하여 완벽하게 활용하는(Hero)** 단계까지 안내하는 통합 가이드입니다. 
환경 설정, Notion 연동, Cursor 연결, 그리고 핵심 기능인 **IPI(Prompt Injection) 감지 시연**까지 모든 과정을 상세히 다룹니다.

---

## 📋 목차
1. [프로젝트 소개 및 아키텍처](#1-프로젝트-소개-및-아키텍처)
2. [필수 준비물](#2-필수-준비물-prerequisites)
3. [설치 및 실행 (Installation & Setup)](#3-설치-및-실행-installation--setup)
4. [설정 가이드 (Configuration)](#4-설정-가이드-configuration)
    - [Notion MCP 서버 등록](#41-notion-mcp-서버-등록)
    - [Gateway 엔드포인트 생성](#42-gateway-엔드포인트-생성)
5. [Cursor 연결 (Connect to AI)](#5-cursor-연결-connect-to-ai)
6. [✨ 핵심 시연: IPI 감지 (The Core Demo)](#6-핵심-시연-ipi-감지-the-core-demo)
    - [시나리오 1: 정상 사용](#시나리오-1-정상-사용-benign-usage)
    - [시나리오 2: 공격 시뮬레이션](#시나리오-2-공격-시뮬레이션-attack-simulation)
    - [시나리오 3: 관리자 대응 (차단/마스킹)](#시나리오-3-관리자-대응-admin-response)

---

## 1. 프로젝트 소개 및 아키텍처

**MetaMCP Gateway**는 여러 MCP(Model Context Protocol) 서버를 하나로 묶어 관리하고, 그 사이를 흐르는 데이터를 모니터링하여 **보안 위협(IPI)**을 감지하는 지능형 미들웨어 플랫폼입니다.

### 🏗️ 시스템 구조 (System Architecture)

```mermaid
graph LR
    Cursor[Cursor / Claude (Client)] -- SSE Connection --> Gateway[MetaMCP Gateway]
    Gateway -- IPI Middleware --> Security{IPI Check}
    Security -- "Safe" --> MCPServer[Notion MCP Server]
    Security -- "Threat Detected" --> AdminUI[Admin Panel / Logs]
    MCPServer -- API Request --> ExternalAPI[Notion API]
    
    subgraph "MetaMCP Docker Environment"
        Gateway
        MCPServer
        PostgreSQL[(Database)]
    end
```

---

## 2. 필수 준비물 (Prerequisites)

시작하기 전, 컴퓨터에 다음이 설치되어 있어야 합니다:
1.  **Docker & Discord Desktop**: 컨테이너 환경 실행을 위해 필수입니다.
2.  **Notion API Key**: [Notion Developers](https://www.notion.so/my-integrations)에서 'Internal Integration'을 생성하여 시크릿 키(`secret_...`)를 발급받으세요. 테스트할 페이지에 해당 통합을 연결해야 합니다.
3.  **Cursor (또는 Claude Desktop)**: MCP를 지원하는 AI 에디터/클라이언트.

---

## 3. 설치 및 실행 (Installation & Setup)

가장 안정적인 **Docker** 환경에서 실행하는 것을 권장합니다.

### 1단계: 프로젝트 준비 및 환경 변수 설정
터미널을 열고 프로젝트 폴더로 이동한 뒤 실행하세요:

```bash
# 예제 환경 변수 파일을 복사하여 실제 설정 파일 생성
cp .env.example .env
```

`.env` 파일은 기본 설정으로 두어도 Docker에서 문제없이 작동합니다.

### 2단계: 서비스 실행
Docker Compose를 사용하여 백엔드, 프론트엔드, 데이터베이스를 한 번에 실행합니다.

```bash
docker-compose up --build
```

- **최초 실행 시:** 이미지를 다운로드하고 빌드하느라 3~5분 정도 소요될 수 있습니다.
- **실행 완료 확인:** 로그에 `Server is running on port 12009`와 `Ready` 메시지가 보이면 성공입니다.

### 접속 정보
- **Web UI (Admin Panel):** [http://localhost:12008](http://localhost:12008)
- **Backend API:** [http://localhost:12009](http://localhost:12009)

---

## 4. 설정 가이드 (Configuration)

웹 UI([localhost:12008](http://localhost:12008))에 접속하여 다음 단계를 진행합니다.

### 4.1. Notion MCP 서버 등록
MetaMCP가 Notion과 통신할 수 있도록 서버를 등록합니다.

1.  좌측 메뉴 **MCP Servers** 클릭 > 우측 상단 **Add Server** 버튼 클릭.
2.  다음 정보를 입력합니다:
    - **Name:** `notion`
    - **Type:** `STDIO`
    - **Command:** `npx`
    - **Args:** `-y @notionhq/notion-mcp-server`
        > **팁:** `-y` 옵션은 자동 설치 승인을 위해 필수입니다.
    - **Environment Variables:**
        - `NOTION_API_KEY`: `secret_...` (발급받은 Notion 키 입력)
3.  **Save** 클릭. "Connected" 상태가 되면 성공입니다.

### 4.2. Gateway 엔드포인트 생성
Cursor가 접속할 수 있는 '문'을 만듭니다.

1.  좌측 메뉴 **Endpoints** 클릭 > **Create Endpoint** 클릭.
2.  설정:
    - **Name:** `cursor-connect`
    - **Namespace:** `default` (방금 만든 notion 서버가 포함된 네임스페이스)
    - **Authentication:** 테스트 편의를 위해 **모두 끔(Disable)** (체크 해제).
3.  **Create** 클릭.
4.  생성된 카드에서 **SSE URL**을 복사해 둡니다.
    - 예: `http://localhost:12009/metamcp/cursor-connect/sse`

---

## 5. Cursor 연결 (Connect to AI)

이제 AI 에디터인 Cursor에 MetaMCP를 연결합니다.

1.  **Cursor** 실행 > `Cmd + ,` (설정) > **Features** > **MCP**.
2.  **Add new MCP server** 클릭.
    - **Name:** `MetaMCP`
    - **Type:** `SSE`
    - **URL:** 위에서 복사한 SSE URL 붙여넣기 (`http://localhost:12009/metamcp/cursor-connect/sse`)
3.  **Add** 클릭. 초록색 불(🟢)이 들어오면 연결 성공입니다!

---

## 6. ✨ 핵심 시연: IPI 감지 (The Core Demo)

이제 이 프로젝트의 꽃인 **지능형 프롬프트 주입(IPI) 감지** 기능을 시연해 봅니다.

### 시나리오 1: 정상 사용 (Benign Usage)
먼저, 일반적인 요청이 잘 작동하는지 확인합니다.

-   **Cursor Chat (`Cmd + L`)**:
    > "Notion에서 내 페이지 목록을 보여줘"
-   **결과**: Notion의 실제 데이터가 정상적으로 표시됩니다. (IPI 감지 시스템 통과)

### 시나리오 2: 공격 시뮬레이션 (Attack Simulation)
악의적인 프롬프트가 포함된 데이터를 시뮬레이션합니다. (현재 테스트를 위해 `"ATTACK"` 키워드를 위험 요소로 간주합니다)

1.  **Notion 준비**: Notion에 페이지를 하나 만들고 제목이나 내용에 `"ATTACK"`이라는 단어를 포함시킵니다. (예: "Project Plan ATTACK Simulation")
2.  **Cursor Chat**:
    > "Notion에서 'ATTACK'이라는 단어가 들어간 페이지를 찾아줘"
3.  **반응**:
    -   Cursor의 응답이 멈추거나 에러가 발생합니다. (Gateway가 데이터를 가로챘기 때문입니다!)
    -   **Web UI 확인**: [http://localhost:12008/ipi-detection](http://localhost:12008/ipi-detection) 페이지로 이동합니다.
    -   **경고 발생**: 방금 요청에 대한 **🔴 Pending (Action Required)** 항목이 새로 생긴 것을 볼 수 있습니다.

### 시나리오 3: 관리자 대응 (Admin Response)
보안 담당자가 되어 위협을 처리합니다.

1.  **/ipi-detection** 페이지에서 해당 로그를 클릭합니다.
2.  **위협 내용 확인**: 탐지된 이유(Reason)와 원본 데이터를 검토합니다.
3.  **조치 선택**:
    -   🔴 **Block Execution**: 아예 차단합니다. Cursor에는 에러가 반환됩니다.
    -   🟡 **Mask Sensitive Data**: 민감 정보를 가립니다. Cursor는 `*** MASKED ***` 처리된 데이터를 받습니다.
    -   🟢 **Allow**: 위험을 감수하고 허용합니다.

**실습:** **Mask Sensitive Data**를 클릭해 보세요. Cursor 채팅창에 마스킹된 데이터가 도착하는 것을 확인할 수 있습니다.

---

## 🛠️ 문제 해결 (Troubleshooting)

### Q. Cursor 연결이 자꾸 끊겨요 (404/405 Error)
- 주소가 `.../sse`로 끝나는지 다시 확인하세요.
- 백엔드 주소(`http://localhost:12009`)가 맞는지 확인하세요. (프론트엔드인 12008이 아닙니다)

### Q. DB 연결 오류 (`ECONNREFUSED`)
- Docker 컨테이너 재시작이 답입니다. `docker-compose down` 후 다시 `up` 하세요.

### Q. Notion 401 Unauthorized
- API Key에 공백이 있거나 잘못 복사되었을 수 있습니다.
- 백엔드 컨테이너에서 다음 명령어로 강제 수정할 수 있습니다:
  ```bash
  docker exec -it metamcp-dev npx tsx src/scripts/fix-notion-env-var.ts
  ```

---
**축하합니다!** 🎉
이제 MetaMCP Gateway를 통해 안전하게 LLM과 외부 툴을 연결할 수 있는 환경을 구축했습니다.
