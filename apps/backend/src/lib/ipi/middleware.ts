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
 * 하이브리드 IPI 탐지 로직 (HNSW Vector Store + LLM Verification)
 * 
 * 1. 벡터 유사도 검색으로 빠르게 1차 필터링
 * 2. 애매한 구간(Ambiguous)인 경우 LLM(GPT-5-mini)으로 정밀 분석
 */
async function detectIPI(
    toolName: string,
    result: CallToolResult,
): Promise<{ detected: boolean; reason?: string; analysisReport?: string }> {
    try {
        const contentStr = JSON.stringify(result.content);

        // 1. 콘텐츠를 임베딩 벡터로 변환
        const embedder = LocalEmbeddingService.getInstance();
        const vector = await embedder.getEmbedding(contentStr);

        // 2. 벡터 저장소에서 유사도 검색
        const vectorStore = VectorStore.getInstance();
        const riskResult = await vectorStore.searchRisk([vector]);

        // 하이브리드 임계값 설정
        const HIGH_RISK_THRESHOLD = 0.82;
        const AMBIGUOUS_THRESHOLD = 0.5;

        // Case A: 고신뢰도 공격 (Score > 0.82) - 즉시 차단
        if (riskResult.score > HIGH_RISK_THRESHOLD) {
            return {
                detected: true,
                reason: `고신뢰도 벡터 탐지 (점수: ${riskResult.score.toFixed(2)}): ${riskResult.reason}`,
                analysisReport: "높은 벡터 유사도로 인해 즉시 탐지되었습니다. (LLM 검증 생략)",
            };
        }

        // Case B: 의심 단계 (0.5 <= Score <= 0.82) - LLM 교차 검증
        // 오탐(False Positive)을 줄이기 위해 LLM에게 판단을 위임
        if (riskResult.score >= AMBIGUOUS_THRESHOLD) {
            console.log(`[IPI Middleware] 애매한 위험 점수 (${riskResult.score.toFixed(2)}). LLM 검증 시작...`);
            const llmVerifier = IPILLMVerifier.getInstance();
            const verification = await llmVerifier.verifyContent(contentStr);

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

        // Case C: 안전 (Score < 0.5) 또는 LLM이 안전하다고 판단
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
                            // 콘텐츠 마스킹 처리
                            return {
                                ...result,
                                content: result.content.map((item) => {
                                    if (item.type === "text") {
                                        return {
                                            ...item,
                                            text: "*** 사용자에 의해 마스킹 처리됨 ***",
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