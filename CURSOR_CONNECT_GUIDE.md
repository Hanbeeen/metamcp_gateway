# Cursor와 MetaMCP 연결 가이드

이 가이드는 **Cursor** 에디터에서 **MetaMCP**를 MCP 서버로 등록하여 사용하는 방법과 전체 구조를 설명합니다.

---

## 1. 전체 구조 (Architecture)

Cursor에서 Notion 도구를 사용할 때의 데이터 흐름은 다음과 같습니다.

```mermaid
graph LR
    Cursor[Cursor (Client)] -- SSE Connection --> MetaMCP[MetaMCP (Gateway)]
    MetaMCP -- IPI Middleware --> NotionMCP[Notion MCP Server]
    NotionMCP -- API Request --> NotionAPI[Notion API]
    
    subgraph "MetaMCP Docker Container"
        MetaMCP
        NotionMCP
    end
```

### 키 관리 (Key Management)
각 구간별로 필요한 키는 다음과 같이 관리됩니다.

1.  **Notion API Key**:
    *   **위치**: MetaMCP 내부에 저장됨 (Notion MCP 서버 등록 시 입력)
    *   **역할**: Notion MCP 서버가 Notion API를 호출할 때 사용
    *   **Cursor**: 이 키를 알 필요가 **없습니다**.

2.  **MetaMCP API Key** (선택 사항):
    *   **위치**: Cursor의 MCP 설정 (URL 파라미터)
    *   **역할**: Cursor가 MetaMCP에 접속할 때 인증용으로 사용
    *   **설정**: MetaMCP 엔드포인트 설정에서 `Enable API Key Auth`가 켜져 있을 때만 필요합니다.
    *   **사용법**: URL 뒤에 `?api_key=sk_...` 형태로 붙여서 사용

---

## 2. MetaMCP 엔드포인트 준비

먼저 MetaMCP에서 연결할 엔드포인트 URL을 확인해야 합니다.

1. **MetaMCP 접속**: [http://localhost:12008](http://localhost:12008)
2. **엔드포인트 생성**:
   - 좌측 메뉴에서 **Endpoints** 클릭
   - **"Create Endpoint"** 클릭
   - **Name**: `cursor-test` (원하는 이름)
   - **Namespace**: 연결할 네임스페이스 선택 (Notion MCP가 포함된 네임스페이스)
   - **Auth 설정**: 테스트 편의를 위해 초기에는 **모든 인증 옵션을 끄는 것**을 권장합니다.
   - **Create** 클릭
3. **URL 확인**:
   - 생성된 엔드포인트 카드에서 **SSE URL**을 복사합니다.
   - 형식: `http://localhost:12008/metamcp/cursor-test/sse`

---

## 3. Cursor 설정

Cursor에서 MCP 서버를 등록합니다.

1. **Cursor 설정 열기**:
   - `Cmd + ,` (Mac) 또는 `Ctrl + ,` (Windows)를 눌러 설정 진입
   - 또는 상단 메뉴 `Cursor` > `Settings`
2. **MCP 설정 이동**:
   - 설정 메뉴 중 **Features** > **MCP** 선택
3. **새 서버 추가**:
   - **"Add new MCP server"** 버튼 클릭
   - JSON 형식의 MCP 서버 설정을 입력합니다:
     ```json
     {
       "mcpServers": {
         "MetaMCP": {
           "url": "http://localhost:12008/metamcp/cursor-test/sse"
         }
       }
     }
     ```
     > **팁**: 만약 MetaMCP에서 API Key 인증을 켰다면, URL 뒤에 키를 붙여주세요.
     > 예: `"url": "http://localhost:12008/metamcp/cursor-test/sse?api_key=sk_mt_..."`

4. **저장**: `Save` 또는 `Add` 클릭

---

## 4. 연결 확인 및 테스트

1. **연결 상태 확인**:
   - Cursor 설정의 MCP 목록에서 `MetaMCP` 옆에 **초록색 불**이 들어오는지 확인합니다.
   - 연결 실패 시 URL이 정확한지, MetaMCP 서버가 실행 중인지 확인하세요.

2. **Composer 테스트 (Cmd + I)**:
   - Cursor의 Composer 창(`Cmd + I`)을 엽니다.
   - `@Notion` (또는 등록한 도구 이름)을 입력해 봅니다.
   - MetaMCP에 등록된 도구들이 자동완성 목록에 나타나면 성공입니다.

3. **IPI 탐지 테스트**:
   - Composer에서 Notion 도구를 사용하여 `ATTACK` 키워드가 포함된 페이지를 읽도록 요청합니다.
   - MetaMCP 백엔드에서 탐지가 발생하고, 브라우저의 MetaMCP 화면에 **Security Alert** 모달이 뜨는지 확인합니다.
