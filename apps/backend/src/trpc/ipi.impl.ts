import { ipiDecisionStore } from "../lib/ipi-decision-store";

export const ipiImplementations = {
    getPending: async () => {
        return ipiDecisionStore.getPendingDecisions();
    },

    getHistory: async () => {
        return ipiDecisionStore.getHistory();
    },

    resolve: async (input: {
        id: string;
        status: "allowed" | "masked" | "blocked";
    }) => {
        const success = ipiDecisionStore.resolveDecision(input.id, input.status);
        if (!success) {
            throw new Error("Decision not found or already resolved");
        }
        return { success: true };
    },
};
