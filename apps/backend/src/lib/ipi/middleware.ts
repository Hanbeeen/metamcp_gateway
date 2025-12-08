import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
    CallToolMiddleware,
    MetaMCPHandlerContext,
} from "../metamcp/metamcp-middleware/functional-middleware";
import { ipiDecisionStore } from "./decision-store";

import { VectorStore } from "./vector-store";
import { LocalEmbeddingService } from "./embedder";

/**
 * Real detection using HNSW Vector Store
 */
import { IPILLMVerifier } from "./llm-verifier";

/**
 * Real detection using Hybrid Approach (HNSW Vector Store + LLM Verification)
 */
async function detectIPI(
    toolName: string,
    result: CallToolResult,
): Promise<{ detected: boolean; reason?: string; analysisReport?: string }> {
    try {
        const contentStr = JSON.stringify(result.content);

        // 1. Convert content to embedding
        const embedder = LocalEmbeddingService.getInstance();
        const vector = await embedder.getEmbedding(contentStr);

        // 2. Search in Vector Store
        const vectorStore = VectorStore.getInstance();
        const riskResult = await vectorStore.searchRisk([vector]);

        // Hybrid Thresholds
        const HIGH_RISK_THRESHOLD = 0.82;
        const AMBIGUOUS_THRESHOLD = 0.5;

        // Case A: High Confidence Attack (Vector Score > 0.82)
        if (riskResult.score > HIGH_RISK_THRESHOLD) {
            return {
                detected: true,
                reason: `High confidence vector match (Score: ${riskResult.score.toFixed(2)}): ${riskResult.reason}`,
                analysisReport: "Detected by High-Confidence Vector Similarity Search.",
            };
        }

        // Case B: Ambiguous / Suspicious (0.5 <= Score <= 0.82)
        // Verify with LLM to reduce false positives/negatives
        if (riskResult.score >= AMBIGUOUS_THRESHOLD) {
            console.log(`[IPI Middleware] Ambiguous risk score (${riskResult.score.toFixed(2)}). Verifying with LLM...`);
            const llmVerifier = IPILLMVerifier.getInstance();
            const verification = await llmVerifier.verifyContent(contentStr);

            if (verification.isAttack) {
                return {
                    detected: true,
                    reason: `LLM Verified Threat (Vector Score: ${riskResult.score.toFixed(2)}): ${verification.reason}`,
                    analysisReport: verification.report,
                };
            } else {
                console.log(`[IPI Middleware] LLM cleared the content (Reason: ${verification.reason})`);
            }
        }

        // Case C: Safe (Score < 0.5) OR LLM said safe
        return { detected: false };

    } catch (error) {
        console.error("[IPI Middleware] Detection failed:", error);
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
            // 1. Execute the tool first to get the result
            // Note: We are intercepting the *result*, not the request, 
            // because we want to check the data returned from the tool (e.g., Notion content).
            const result = await handler(request, context);

            if (!options.enabled) {
                return result;
            }

            try {
                // 2. Perform Detection
                const detection = await detectIPI(request.params.name, result);

                if (detection.detected) {
                    console.log(
                        `[IPI Middleware] Threat detected in tool ${request.params.name}: ${detection.reason}`,
                    );

                    // 3. If detected, pause and wait for user decision
                    const decision = await ipiDecisionStore.addDecision(
                        request.params.name,
                        result.content,
                        detection.reason,
                        detection.analysisReport, // Pass the report
                    );

                    console.log(
                        `[IPI Middleware] User decision received: ${decision.status}`,
                    );

                    // 4. Handle Decision
                    switch (decision.status) {
                        case "blocked":
                            throw new Error("Tool execution blocked by user due to security risk.");

                        case "masked":
                            // Mask the content
                            return {
                                ...result,
                                content: result.content.map((item) => {
                                    if (item.type === "text") {
                                        return {
                                            ...item,
                                            text: "*** MASKED BY USER ***",
                                        };
                                    }
                                    return item;
                                }),
                            };

                        case "allowed":
                            // Return original result
                            return result;

                        default:
                            return result;
                    }
                }
            } catch (error) {
                console.error("[IPI Middleware] Error during detection:", error);
                // Fail safe: In case of error, what should we do? 
                // For now, let's rethrow if it was a block, otherwise return result?
                // If the error is "Tool execution blocked...", rethrow it.
                if (error instanceof Error && error.message.includes("blocked")) {
                    throw error;
                }
                // Otherwise, maybe just log and return result to avoid breaking flow on detection error?
                // Or fail secure? Let's return result for now but log heavily.
                return result;
            }

            return result;
        };
    };
}