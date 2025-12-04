import { v4 as uuidv4 } from "uuid";

export type IPIDecisionStatus = "pending" | "allowed" | "masked" | "blocked";

export interface IPIDecision {
  id: string;
  toolName: string;
  content: any;
  status: IPIDecisionStatus;
  timestamp: number;
  detectedThreat?: string; // e.g., "Prompt Injection Detected"
}

class IPIDecisionStore {
  private decisions: Map<string, IPIDecision> = new Map();
  private resolvers: Map<string, (decision: IPIDecision) => void> = new Map();

  // Add a new pending decision and return a promise that resolves when the user makes a decision
  addDecision(
    toolName: string,
    content: any,
    detectedThreat: string = "Potential Security Risk",
  ): Promise<IPIDecision> {
    const id = uuidv4();
    const decision: IPIDecision = {
      id,
      toolName,
      content,
      status: "pending",
      timestamp: Date.now(),
      detectedThreat,
    };

    this.decisions.set(id, decision);

    return new Promise((resolve) => {
      this.resolvers.set(id, resolve);
    });
  }

  // Get a specific decision by ID
  getDecision(id: string): IPIDecision | undefined {
    return this.decisions.get(id);
  }

  // Get all pending decisions
  getPendingDecisions(): IPIDecision[] {
    return Array.from(this.decisions.values())
      .filter((d) => d.status === "pending")
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  // Get all decisions (history)
  getHistory(): IPIDecision[] {
    return Array.from(this.decisions.values()).sort(
      (a, b) => b.timestamp - a.timestamp,
    );
  }

  // Resolve a decision (called by user via UI)
  resolveDecision(id: string, status: IPIDecisionStatus): boolean {
    const decision = this.decisions.get(id);
    const resolve = this.resolvers.get(id);

    if (decision && resolve && decision.status === "pending") {
      decision.status = status;
      resolve(decision);

      // Cleanup
      this.resolvers.delete(id);
      // Optional: Keep the decision in history or remove it? 
      // For now, let's keep it in memory but we might want to clean it up later.
      // this.decisions.delete(id); 

      return true;
    }
    return false;
  }
}

export const ipiDecisionStore = new IPIDecisionStore();
