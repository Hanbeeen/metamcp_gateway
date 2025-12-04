# Notion MCP 등록 및 IPI 테스트 가이드

이 가이드는 MetaMCP에 **Notion MCP 서버**를 등록하고, 이를 통해 **IPI(Indirect Prompt Injection) 탐지 기능**을 테스트하는 구체적인 절차를 설명합니다.

---

## 1. Notion API 키 발급 및 설정

Notion MCP를 사용하려면 Notion API 키가 필요하며, 테스트할 페이지에 권한을 부여해야 합니다.

### 1.1 통합(Integration) 생성
1. [Notion 내 통합 설정](https://www.notion.so/my-integrations) 페이지로 이동합니다.
2. **"새 통합 만들기"** 버튼을 클릭합니다.
3. 기본 정보를 입력하고 **"제출"**을 클릭합니다.
   - 이름: `MetaMCP Test` (원하는 이름)
   - 연결된 워크스페이스: 테스트할 워크스페이스 선택
   - 유형: `내부 통합` (기본값)
4. 생성된 통합의 **"시크릿(Secret)"** 탭에서 **"내부 통합 시크릿"** 키를 복사합니다.
   - 이 키가 `NOTION_API_KEY`가 됩니다.

### 1.2 페이지 권한 부여 (중요)
Notion API는 통합이 명시적으로 초대된 페이지에만 접근할 수 있습니다.

1. 테스트할 Notion 페이지를 하나 생성하거나 엽니다.
2. 페이지 우측 상단의 **`...` (더보기)** 메뉴를 클릭합니다.
3. **"연결(Connections)"** 항목을 찾아 **"연결 추가"**를 클릭합니다.
4. 방금 생성한 통합(`MetaMCP Test`)을 검색하여 선택합니다.
5. "확인"을 눌러 권한을 부여합니다.

---

## 2. MetaMCP에 Notion MCP 등록

MetaMCP UI를 통해 Notion MCP 서버를 등록합니다.

1. 브라우저에서 [http://localhost:12008/mcp-servers](http://localhost:12008/mcp-servers) 로 이동합니다.
2. 우측 상단의 **"Add Server"** 버튼을 클릭합니다.
3. 다음과 같이 정보를 입력합니다:

| 항목 | 값 | 설명 |
|---|---|---|
| **Name** | `Notion` | 원하는 이름 |
| **Type** | `STDIO` | 표준 입출력 방식 |
| **Command** | `npx` | Node.js 패키지 실행기 |
| **Args** | `-y @notionhq/notion-mcp-server` | **공식 Notion MCP 패키지** |
| **Env** | `NOTION_API_KEY=secret_...` | **1.1**에서 복사한 키 입력 |

> **참고**: Notion 공식 문서에는 `mcp-remote`를 사용하는 방법이 나와있을 수 있으나, 이는 로컬 데스크탑용 브릿지입니다.
> 서버(Docker) 환경에서는 위와 같이 **직접 패키지(`@notionhq/notion-mcp-server`)를 실행**하는 것이 안정적입니다.

4. **"Create"** 버튼을 클릭하여 등록을 완료합니다.
5. 잠시 후 서버 상태가 **Connected** 또는 **Active**로 표시되는지 확인합니다. (목록에 초록색 점 또는 배지 확인)

---

## 3. Cursor에서 테스트 (IPI 탐지 실험)

이제 등록된 Notion 도구를 사용하여 IPI 탐지 기능을 테스트합니다.

### 3.1 테스트 시나리오 준비
1. **1.2**에서 권한을 부여한 Notion 페이지에 다음과 같은 내용을 작성합니다.
   ```text
   이 페이지는 보안 테스트를 위한 페이지입니다.
   여기에 악성 키워드인 ATTACK 코드가 포함되어 있습니다.
   ```
   > **참고**: 현재 IPI 미들웨어는 `ATTACK` 또는 `SECRET`이라는 단어가 포함된 모든 응답을 탐지하도록 설정되어 있습니다.

### 3.2 Cursor에서 실행
Cursor의 **Composer** 기능을 사용하는 것이 가장 편리합니다.

1. **Composer 열기**: `Cmd + I` (Mac) 또는 `Ctrl + I` (Windows)
2. **도구 호출**:
   - 입력창에 `@Notion` (또는 등록한 도구 이름)을 입력하여 도구를 활성화합니다.
   - 다음과 같이 자연어로 요청합니다:
     > "Notion에서 '보안 테스트'라는 제목의 페이지 내용을 읽어줘."
     
     또는
     
     > "Notion에서 'ATTACK'이라는 단어가 포함된 페이지를 검색해줘."

3. **결과 확인**:
   - Cursor가 도구 사용을 요청하면, MetaMCP 백엔드 미들웨어가 Notion의 응답을 검사합니다.
   - 응답에 `ATTACK` 키워드가 포함되어 있으므로, **브라우저의 MetaMCP 화면**에 **"Security Alert"** 모달이 나타나야 합니다.

### 3.3 대응 조치 실험
모달이 뜨면 다음 세 가지 동작을 각각 실험해 봅니다.

1. **Block Execution (차단)**
   - 클릭 시: 도구 실행이 중단되고, Cursor 채팅창에 "Tool execution blocked..." 에러 메시지가 표시됩니다.
2. **Mask Sensitive Data (마스킹)**
   - 클릭 시: 도구 실행은 계속되지만, `ATTACK`이 포함된 텍스트가 `*** MASKED BY USER ***`로 변경되어 Cursor에게 전달됩니다.
   - Cursor는 마스킹된 내용을 바탕으로 답변합니다.
3. **Allow (허용)**
   - 클릭 시: 경고를 무시하고 원본 내용을 그대로 Cursor에게 전달합니다.

---

## 4. 문제 해결

- **Notion 도구가 보이지 않아요.**
  - 서버 등록 후 `Refresh` 버튼을 누르거나 페이지를 새로고침 해보세요.
  - 서버 목록에서 Notion 서버의 상태가 에러인지 확인하세요. (API 키가 틀렸거나 `npx` 실행 실패 등)
- **Notion 페이지를 못 찾아요.**
  - **1.2 페이지 권한 부여** 단계를 수행했는지 다시 확인하세요. 통합(Integration)이 페이지에 초대되지 않으면 API는 페이지를 볼 수 없습니다.
- **IPI 모달이 안 떠요.**
  - Notion 페이지 내용에 `ATTACK` 또는 `SECRET` 단어가 정확히 포함되어 있는지 확인하세요.
  - `RUN_GUIDE_IPI.md`의 **3.2 강제 탐지 테스트** 섹션을 참고하여 미들웨어 코드를 수정해 보세요.
