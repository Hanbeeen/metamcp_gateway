# 통합 변경 사항 로그 (Integrated Changelog)

이 문서는 프로젝트의 전체 변경 사항을 **PR 병합으로 추가된 기능**과 **사용자(Developer)가 직접 수정한 내역**으로 구분하여 정리했습니다.

## 1. 🚀 PR #1 병합으로 추가된 기능 (Feat: hnsw index filtering)
*이 내용은 GitHub PR #1에서 병합된 새로운 기능들입니다.*

### 핵심 기능: 실제 IPI 감지 (HNSW Vector Store)
- **`apps/backend/src/lib/ipi/vector-store.ts`**
    - HNSW(Hierarchical Navigable Small World) 알고리즘을 사용한 로컬 벡터 저장소 구현.
    - 코사인 유사도 기반의 위험도 검색(`searchRisk`) 기능 제공.
- **`apps/backend/src/lib/ipi/embedder.ts`**
    - HuggingFace Transformers(`all-MiniLM-L6-v2`)를 사용한 텍스트 임베딩 생성기.
- **`apps/backend/src/lib/ipi/hnsw-store.ts`**
    - (PR 내 포함된 HNSW 관련 유틸리티)

### 실행 스크립트
- **`apps/backend/scripts/build-index.ts`**
    - 초기 벡터 인덱스 생성을 위한 스크립트.
- **`apps/backend/scripts/verify-ipi-node.ts`**
    - IPI 감지 기능 검증 스크립트.

### 의존성 추가
- `@huggingface/transformers`: 로컬 임베딩 처리.
- `hnswlib-node`: 고성능 벡터 검색 라이브러리.- `hnswlib-node`: 고성능 벡터 검색 라이브러리.


## 2. 🧠 하이브리드 IPI 탐지 시스템 (Hybrid IPI Detection)
*기존 Vector 기반 탐지에 LLM 검증을 더해 정확도를 획기적으로 개선했습니다.*

### 🛠️ 하이브리드 탐지 로직 (Logic)
- **Vector Search (1차):** 기존 HNSW 인덱스를 사용해 코사인 유사도 검색 수행.
- **LLM Verification (2차):**
    - 유사도 점수가 **애매한 구간 (0.5 ~ 0.82)**일 때만 **OpenAI `gpt-5-mini`** API를 호출.
    - `gpt-4o` 대비 더 가볍지만, IPI 분석에 필수적인 **추론 능력(Reasoning)**을 갖춘 최적의 모델 선정.
    - 확실한 공격(> 0.82)이나 안전한 건에 대해서는 LLM 호출을 생략.

### ✨ 기능 추가 (Features)
- **`IPILLMVerifier` Class:** OpenAI API 연동을 담당하는 클래스 구현 (`apps/backend/src/lib/ipi/llm-verifier.ts`).
- **AI Analysis Report:** LLM이 분석한 상세 리포트를 프론트엔드 UI에 표시.
- **상태 동기화:** `analysisReport` 필드를 `IPIDecision` 스키마에 추가하여 저장 및 조회 가능.

### 🧹 스크립트 디렉토리 정리 (Cleanup)
- 파편화되어 있던 `src/scripts` 디렉토리를 **`apps/backend/scripts/`**로 통합.
- `debug-notion-token.ts`, `fix-notion-env-var.ts` 이전 및 경로 수정 완료.

## 3. 🛡️ IPI 탐지 고도화 (Advanced IPI Detection)
*교묘하게 숨겨진 공격 패턴을 찾아내기 위해 분석 로직을 강화했습니다.*

### 🚀 정확도 개선 (Accuracy Improvements)
- **Dense Sliding Window Chunking:**
    - 긴 텍스트를 단순히 자르는 것이 아니라, 단어 단위로 **중첩(Overlap)**하여 세밀하게 쪼개서 분석합니다.
    - 문맥이 끊기는 것을 방지하고, 텍스트 중간에 숨겨진 프롬프트 주입 공격을 효과적으로 찾아냅니다.
- **Batch Embedding:**
    - 쪼개진 여러 개의 텍스트 청크를 **배치(Batch)**로 묶어 한 번에 벡터로 변환합니다.
- **Weighted Voting Algorithm:**
    - 단순 평균이 아닌, 유사도가 높은 청크에 가중치를 더 주는 방식으로 위험 점수를 산출합니다.
    - **Top-10** 청크의 위험도를 종합하여 오탐(False Positive)을 줄였습니다.

### ⚙️ 임계값 최적화 (Threshold Tuning)
- 데이터 분석 결과를 바탕으로 임계값을 조정했습니다.
    - **High Risk:** 0.82 → **0.87** (더 확실한 것만 즉시 차단)
    - **Ambiguous:** 0.50 → **0.55** (LLM 검증 구간 미세 조정)

---
*이 내용은 IPI 탐지 시스템의 기반이 된 초기 커밋(9c720e6)의 상세 분석입니다.*

### 핵심 구현 로직
- **미들웨어 (Middleware):** `ipi-detection.middleware.ts`를 통해 MCP 도구 실행 결과를 가로채는 파이프라인 구축. (초기에는 문자열 매칭 방식)
- **상태 관리 (Store):** `ipi-decision-store.ts`를 통해 탐지된 위협과 사용자 결정(Pending/Block/Allow)을 메모리 상에서 관리.
- **프록시 연결:** `metamcp-proxy.ts`에 미들웨어를 등록하여 모든 툴 실행 시 검사가 수행되도록 연결.

### 프론트엔드 및 UI
- **탐지 대시보드:** `apps/frontend/app/[locale]/(sidebar)/ipi-detection/page.tsx` 구현.
- **관리자 액션:** 위협 발생 시 차단(Block), 마스킹(Mask), 허용(Allow)을 선택할 수 있는 UI 제공.

### API (tRPC)
- **`packages/trpc/src/routers/frontend/ipi.ts`**: 프론트엔드와 통신하기 위한 API 정의 (getPending, resolve, getHistory).
- **`apps/backend/src/trpc/ipi.impl.ts`**: 실제 백엔드 로직 구현체.

### 문서화
- `CHANGELOG.md`, `MASTER_GUIDE.md` 등 프로젝트 문서화의 시작점이 됨.

---


## 4. 🛠️ 사용자(Developer)가 직접 수정한 내역
*이 내용은 디버깅 및 안정화를 위해 직접 추가하거나 수정한 내역입니다.*

### 백엔드 (Backend) - 디버깅 및 안정화
#### 1. 인증 및 환경 변수 (Auth & Env)
- **`apps/backend/src/lib/metamcp/utils.ts`**
    - `resolveEnvVariables`: 환경 변수 값의 공백(`trim`) 자동 제거 로직 추가.
- **`apps/backend/src/lib/metamcp/client.ts`**
    - 환경 변수 조달 시점의 상태 확인을 위한 디버그 로그 추가.

#### 2. 데이터베이스 및 네트워크 (DB & Network)
- **`apps/backend/src/db/index.ts`**
    - **중요:** `INTERNAL_DATABASE_URL` 우선 사용 로직 추가 (Docker 내부 통신 고정).
    - 연결 문자열 마스킹 로그 추가.
- **`apps/backend/drizzle.config.ts`**
    - 마이그레이션 실행 시 내부 DB 주소 우선 사용 설정.
- **`docker-compose.yml`**
    - `INTERNAL_DATABASE_URL` 환경 변수 주입 및 `app` 서비스의 DB 연결 호스트 고정.
- **`docker-entrypoint-dev.sh`**
    - 마이그레이션(`drizzle-kit`) 실행 직전 `DATABASE_URL` 강제 export 로직 추가 (연결 오류 `ECONNREFUSED` 해결).

#### 3. API 및 서버 (API & Server)
- **`apps/backend/src/routers/public-metamcp/sse.ts`**
    - `POST /:endpoint_name/sse` 핸들러 추가 (Cursor 연결 404/405 오류 방지).
- **`apps/backend/src/routers/mcp-proxy/server.ts`**
    - 명령어 실행 파일명 매칭(basename) 로직 개선 (경로 불일치 오류 해결).
- **`apps/backend/src/lib/ipi/middleware.ts`**
    - **통합:** 기존 Mock 로직을 제거하고, PR #1의 `VectorStore`와 `LocalEmbeddingService`를 사용하도록 연결.

#### 4. 유틸리티 스크립트 (Scripts)
*위치는 `apps/backend/scripts/`로 통합됨*
- **`debug-notion-token.ts`**: Notion 인증 정보(공백 등) DB 조회용.
- **`fix-notion-env-var.ts`**: Notion 환경 변수명(`API_KEY` -> `NOTION_API_KEY`) 자동 보정용.

#### 5. 파일 정리 및 리팩토링 (Cleanup)
- **문서 통합:** 파편화된 가이드(`RUN_GUIDE_IPI.md`, `CURSOR_CONNECT_GUIDE.md`)를 삭제하고 **`MASTER_GUIDE.md`**로 통합.
- **코드 정리:** 사용하지 않는 프론트엔드 컴포넌트(`ipi-decision-modal.tsx`) 삭제.
- **구조 개선:** IPI 관련 로직을 `apps/backend/src/lib/ipi/` 디렉토리로 이동하여 모듈화.

### 프론트엔드 (Frontend) - 버그 수정 및 UI
- **`apps/frontend/lib/oauth-provider.ts`**
    - SSR 시 `sessionStorage` 접근 오류(`ReferenceError`) 수정.
- **`apps/frontend/app/[locale]/(sidebar)/ipi-detection/page.tsx`**
    - IPI 감지 로그 확인 및 관리자 액션(Block/Mask/Allow) UI 페이지 구현.
