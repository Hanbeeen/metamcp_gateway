import { z } from "zod";

export const IPIDecisionStatusSchema = z.enum([
    "pending",
    "allowed",
    "masked",
    "blocked",
]);

export const IPIDecisionSchema = z.object({
    id: z.string(),
    toolName: z.string(),
    content: z.any(),
    status: IPIDecisionStatusSchema,
    timestamp: z.number(),
    detectedThreat: z.string().optional(),
});

export type IPIDecision = z.infer<typeof IPIDecisionSchema>;

export const ResolveIPIDecisionRequestSchema = z.object({
    id: z.string(),
    status: z.enum(["allowed", "masked", "blocked"]),
});

export const GetPendingIPIDecisionsResponseSchema = z.array(IPIDecisionSchema);
export const GetIPIDecisionHistoryResponseSchema = z.array(IPIDecisionSchema);
