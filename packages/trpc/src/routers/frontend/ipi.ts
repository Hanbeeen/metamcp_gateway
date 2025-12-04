import {
    GetIPIDecisionHistoryResponseSchema,
    GetPendingIPIDecisionsResponseSchema,
    ResolveIPIDecisionRequestSchema,
} from "@repo/zod-types";

import { protectedProcedure, router } from "../../trpc";

export const createIPIRouter = <
    TImplementations extends {
        getPending: () => Promise<any>;
        getHistory: () => Promise<any>;
        resolve: (input: any) => Promise<any>;
    },
>(
    implementations: TImplementations,
) => {
    return router({
        getPending: protectedProcedure
            .output(GetPendingIPIDecisionsResponseSchema)
            .query(async () => {
                return implementations.getPending();
            }),

        getHistory: protectedProcedure
            .output(GetIPIDecisionHistoryResponseSchema)
            .query(async () => {
                return implementations.getHistory();
            }),

        resolve: protectedProcedure
            .input(ResolveIPIDecisionRequestSchema)
            .mutation(async ({ input }) => {
                return implementations.resolve(input);
            }),
    });
};
