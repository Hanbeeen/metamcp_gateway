import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
    CallToolMiddleware,
    MetaMCPHandlerContext,
} from "../functional-middleware";
import { ipiDecisionStore } from "../../ipi-decision-store";

/**
 * Mock detection function
 * In a real scenario, this would call the external detection server.
 */
async function detectIPI(
    toolName: string,
    result: CallToolResult,
): Promise<{ detected: boolean; reason?: string }> {
    // Simple mock logic: Detect if the result contains "ATTACK" or "SECRET"
    const contentStr = JSON.stringify(result.content);
    if (contentStr.includes("ATTACK") || contentStr.includes("SECRET")) {
        return {
            detected: true,
            reason: "Sensitive keyword detected (Mock IPI)",
        };
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