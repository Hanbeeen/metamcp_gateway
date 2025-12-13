import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
    CallToolMiddleware,
    MetaMCPHandlerContext,
} from "../metamcp/metamcp-middleware/functional-middleware";
import { ipiDecisionStore } from "./decision-store";

import { VectorStore } from "./vector-store";
import { LocalEmbeddingService } from "./embedder";

import { IPILLMVerifier } from "./llm-verifier";

/**
 * 키 이름에 특정 단어(text, content 등)가 '포함'된 모든 문자열 값을 추출합니다.
 * 예: "plain_text", "rich_text", "body_content" 등 모두 감지 가능
 */
function extractContentByPartialMatch(
    obj: any,
    depth: number = 0,
    maxDepth: number = 20,
    maxLength: number = 30000
): string {
    if (!obj) return "";
    if (depth > maxDepth) return "";

    // 배열인 경우 내부 요소들을 재귀적으로 탐색
    if (Array.isArray(obj)) {
        return obj
            .map(item => extractContentByPartialMatch(item, depth + 1, maxDepth, maxLength))
            .filter(str => str.length > 0)
            .join("\n");
    }

    if (typeof obj !== "object") return "";

    // ✅ 검사할 핵심 키워드 목록
    const TARGET_KEYWORDS = [
        "content", "text", "body", "message",
        "summary", "description", "value", "markdown"
    ];

    let extracted = "";

    for (const key in obj) {
        if (extracted.length >= maxLength) break;

        const val = obj[key];
        const lowerKey = key.toLowerCase();

        // 1. 키 이름에 타겟 키워드가 하나라도 '포함'되어 있는지 확인 (Partial Match)
        // 예: "plain_text"에는 "text"가 포함되므로 통과!
        const isTargetKey = TARGET_KEYWORDS.some(keyword => lowerKey.includes(keyword));

        // 2. 키워드가 포함되어 있고, 값이 '문자열'이면 추출
        if (isTargetKey && typeof val === "string") {
            // 중첩된 JSON 문자열인지 확인 (예: Tool 결과가 JSON string인 경우)
            if (val.trim().startsWith("{") || val.trim().startsWith("[")) {
                try {
                    const parsed = JSON.parse(val);
                    const deepContent = extractContentByPartialMatch(parsed, depth + 1, maxDepth, maxLength);
                    // 내부에서 유의미한 텍스트를 찾았다면 그것을 사용
                    if (deepContent.length > 0) {
                        extracted += deepContent + "\n";
                        continue;
                    }
                } catch (e) {
                    // JSON 파싱 실패 시 일반 텍스트로 처리
                }
            }

            // 너무 짧은 노이즈나 URL 제외 (필요시 주석 해제)
            // if (val.length > 1 && !val.startsWith("http")) {
            extracted += val + "\n";
            // }
        }

        // 3. 값이 객체나 배열이면 재귀 탐색 (키 이름 상관없이 내용은 뒤져봐야 함)
        else if (typeof val === "object") {
            const childText = extractContentByPartialMatch(val, depth + 1, maxDepth, maxLength);
            if (childText) {
                extracted += childText + "\n";
            }
        }
    }

    // 결과 정제
    return extracted.replace(/\n{2,}/g, "\n").trim().substring(0, maxLength);
}

/**
 * Query용 Dense Sliding Window (숨겨진 공격 찾기)
 * 텍스트를 중첩된 윈도우로 분할하여 컨텍스트를 보존하며 세밀하게 검사합니다.
 */
export function chunkDenseWindow(text: string, windowSize: number = 15, step: number = 5): string[] {
    if (!text) return [];

    // 공백 기준 단어 분할
    const words = text.split(/\s+/);

    // 윈도우 크기보다 작으면 통째로 반환
    if (words.length <= windowSize) return [text];

    const chunks: string[] = [];

    // 슬라이딩 윈도우
    for (let i = 0; i < words.length; i += step) {
        const chunk = words.slice(i, i + windowSize);
        // 최소 3단어 이상일 때만 청크로 인정 (너무 짧은 노이즈 제거)
        if (chunk.length >= 3) {
            chunks.push(chunk.join(" "));
        }
    }

    return chunks;
}

/**
 * 하이브리드 IPI 탐지 로직 (HNSW Vector Store + LLM Verification)
 * 
 * 1. 벡터 유사도 검색으로 빠르게 1차 필터링
 * 2. 애매한 구간(Ambiguous)인 경우 LLM(GPT-5-mini)으로 정밀 분석
 */
export async function detectIPI(
    toolName: string,
    result: CallToolResult,
): Promise<{ detected: boolean; reason?: string; analysisReport?: string }> {
    try {
        // 스마트 콘텐츠 추출: 불필요한 JSON 구조를 제거하고 알맹이 텍스트만 분석
        let contentStr = extractContentByPartialMatch(result.content);
        console.log("[DEBUG] Extracted Content:", contentStr);

        // 추출된 텍스트가 너무 짧으면(예: 메타데이터만 가득한 경우) 원본 JSON 사용
        if (contentStr.length < 10) {
            contentStr = JSON.stringify(result.content);
        }

        // 1. 텍스트 분할 (Dense Window Chunking)
        const chunks = chunkDenseWindow(contentStr);

        console.log("[DEBUG] Extracted Content for Embedding:", chunks);

        // 2. 청크 임베딩 (Batch Processing)
        const embedder = LocalEmbeddingService.getInstance();

        let vectors: number[][];

        if (chunks.length === 0) {
            // 청크가 없으면(빈 텍스트 등) 바로 리턴
            return { detected: false };
        }

        if (chunks.length === 1) {
            const v = await embedder.getEmbedding(chunks[0]);
            vectors = [v];
        } else {
            // 배치 임베딩
            vectors = await embedder.getEmbeddings(chunks);
        }

        // 3. 벡터 저장소에서 유사도 검색 (Weighted Voting with Top-10 Average)
        const vectorStore = VectorStore.getInstance();
        await vectorStore.initialize();
        const riskResult = await vectorStore.searchRisk(vectors);

        console.log(`[IPI Debug] Tool: ${toolName}, ContentLen: ${contentStr.length}, Vectors: ${vectors.length}, RiskScore: ${riskResult.score.toFixed(4)}`);

        // 하이브리드 임계값 설정
        // 0.55 ~ 0.87 LLM 호출 %대비 가장 높은 공격 탐지율을 보이는 수치.
        // 강제 LLM 호출 테스트를 위해 임계값을 0.99로 상향 조정
        const HIGH_RISK_THRESHOLD = 0.87;
        const AMBIGUOUS_THRESHOLD = 0.55;

        // Case A: 고신뢰도 공격 (Score > 0.87) - 즉시 차단
        if (riskResult.score > HIGH_RISK_THRESHOLD) {
            // 벡터 DB에서 매칭된 유사 공격 패턴 가져오기
            const matchedAttacks = riskResult.similarAttacks || [];
            const topMatch = matchedAttacks.length > 0 ? matchedAttacks[0] : "Unknown pattern";

            // 입력 텍스트 중 가장 위험한 부분도 식별
            let dangerousInputSnippet = "";
            const snippetsToHighlight: string[] = [];

            if (riskResult.chunkScores && riskResult.chunkScores.length > 0) {
                // 점수와 인덱스를 매핑하여 정렬 (상위 5개 추출)
                const scoredChunks = riskResult.chunkScores
                    .map((score, index) => ({ score, index }))
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 5);

                for (const item of scoredChunks) {
                    if (chunks[item.index]) {
                        snippetsToHighlight.push(chunks[item.index]);
                    }
                }

                // 가장 위험한 문장은 첫 번째로 설정 (호환성 유지)
                if (scoredChunks.length > 0 && chunks[scoredChunks[0].index]) {
                    dangerousInputSnippet = chunks[scoredChunks[0].index];
                }
            }

            console.log(`snippetsToHighlight ${snippetsToHighlight}`);
            return {
                detected: true,
                reason: `High risk content detected (Similar to: "${topMatch.substring(0, 100)}...")`,
                analysisReport: JSON.stringify({
                    isAttack: true,
                    confidence: riskResult.score,
                    reasoning: `Highly similar to known attack patterns in database.`,
                    threatType: "known_pattern",
                    // 마스킹을 위해 실제 입력 텍스트 중 위험한 부분을 전달
                    highlightedSnippets: snippetsToHighlight,
                    // 참고용 유사 패턴 (UI 표시용)
                    similarPatterns: matchedAttacks,
                    suggestedAction: "block",
                    analysisSource: "Cache"
                }, null, 2),
            };
        }

        // Case B: 의심 단계 (0.55 <= Score <= 0.87) - LLM 교차 검증
        // 오탐(False Positive)을 줄이기 위해 LLM에게 판단을 위임
        if (riskResult.score >= AMBIGUOUS_THRESHOLD) {
            console.log(`[IPI Middleware] 애매한 위험 점수 (${riskResult.score.toFixed(2)}). LLM 검증 시작...`);
            const llmVerifier = IPILLMVerifier.getInstance();

            // 추출된 텍스트 컨텍스트와 함께, 벡터 DB에서 찾은 유사 공격 패턴(Hint)도 전달합니다.
            const verification = await llmVerifier.verifyContentWithFewShot(
                contentStr,
                `Tool: ${toolName}`,
                riskResult.score,
                riskResult.similarAttacks || []
            );

            if (verification.isAttack) {
                return {
                    detected: true,
                    reason: `LLM 검증된 위협 (벡터 점수: ${riskResult.score.toFixed(2)}): ${verification.reason}`,
                    analysisReport: verification.report,
                };
            } else {
                console.log(`[IPI Middleware] LLM이 콘텐츠를 안전하다고 판단했습니다. (이유: ${verification.reason})`);
            }
        }

        // Case C: 안전 (Score < 0.55) 또는 LLM이 안전하다고 판단
        return { detected: false };

    } catch (error) {
        console.error("[IPI Middleware] 탐지 실패:", error);
    }

    return { detected: false };
}

export function createIPIDetectionMiddleware(options: {
    enabled: boolean;
}): CallToolMiddleware {
    return (handler) => {
        return async (
            request,
            context: MetaMCPHandlerContext,
        ): Promise<CallToolResult> => {
            // 1. 툴을 먼저 실행하여 결과를 받아옵니다.
            // (요청이 아닌 '결과'를 인터셉트하여 Notion 데이터 등 실제 콘텐츠를 검사합니다.)
            const result = await handler(request, context);

            if (!options.enabled) {
                return result;
            }

            try {
                // 2. IPI 탐지 수행 (하이브리드 로직)
                const detection = await detectIPI(request.params.name, result);

                if (detection.detected) {
                    console.log(
                        `[IPI Middleware] 도구 '${request.params.name}'에서 위협 감지됨: ${detection.reason}`,
                    );

                    // 3. 위협이 감지되면 실행을 멈추고 사용자 결정을 기다립니다.
                    const decision = await ipiDecisionStore.addDecision(
                        request.params.name,
                        result.content,
                        detection.reason,
                        detection.analysisReport, // 리포트 전달
                    );

                    console.log(
                        `[IPI Middleware] 사용자 결정 수신됨: ${decision.status}`,
                    );

                    // 4. 사용자 결정에 따른 처리
                    switch (decision.status) {
                        case "blocked":
                            throw new Error("보안 위험으로 인해 사용자에 의해 툴 실행이 차단되었습니다.");

                        case "masked":
                            // 콘텐츠 부분 마스킹 처리
                            let snippetsToMask: string[] = [];
                            try {
                                if (decision.analysisReport) {
                                    const report = JSON.parse(decision.analysisReport);
                                    if (Array.isArray(report.highlightedSnippets)) {
                                        snippetsToMask = report.highlightedSnippets;
                                    }
                                }
                            } catch (e) {
                                console.warn("[IPI Middleware] 리포트 파싱 실패, 전체 마스킹으로 전환");
                            }

                            return {
                                ...result,
                                content: result.content.map((item) => {
                                    if (item.type === "text") {
                                        let maskedText = item.text;

                                        if (snippetsToMask.length > 0) {
                                            // 1. 특정된 위협 부분만 가리기 (Partial Masking)
                                            snippetsToMask.forEach(snippet => {
                                                if (snippet && snippet.length > 0) {
                                                    // 정규식 특수문자 이스케이프 후 전역 치환
                                                    const escaped = snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                                    const regex = new RegExp(escaped, 'gi');
                                                    maskedText = maskedText.replace(regex, '***(MASKED)***');
                                                }
                                            });
                                        } else {
                                            // 2. 위협 위치를 모를 경우 전체 가리기 (Fallback)
                                            maskedText = "*** 사용자에 의해 마스킹 처리됨 ***";
                                        }

                                        return {
                                            ...item,
                                            text: maskedText,
                                        };
                                    }
                                    return item;
                                }),
                            };

                        case "allowed":
                            // 원본 결과 반환 (위험 감수)
                            return result;

                        default:
                            return result;
                    }
                }
            } catch (error) {
                console.error("[IPI Middleware] 탐지 중 오류 발생:", error);

                // 사용자가 명시적으로 차단한 경우 에러를 다시 던집니다.
                if (error instanceof Error && error.message.includes("차단")) {
                    throw error;
                }
                // 그 외 탐지 로직 에러는 로그를 남기고 원본 결과를 반환합니다. (Fail Open/Safe 정책에 따라 결정)
                return result;
            }

            return result;
        };
    };
}