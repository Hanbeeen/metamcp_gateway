import { v4 as uuidv4 } from "uuid";
import { IPIDecision, IPIDecisionStatus } from "./types";


/**
 * IPI 결정 저장소 (메모리 기반)
 * 탐지된 위협에 대한 사용자 결정을 관리합니다.
 */
class IPIDecisionStore {
  private decisions: Map<string, IPIDecision> = new Map();
  private resolvers: Map<string, (decision: IPIDecision) => void> = new Map();

  /**
   * 새로운 보류(pending) 결정을 추가하고, 사용자 조치를 기다리는 Promise를 반환합니다.
   * (미들웨어는 이 함수가 반환될 때까지 실행을 멈추고 기다립니다.)
   */
  addDecision(
    toolName: string,
    content: any,
    detectedThreat: string = "Unknown Threat",
    analysisReport?: string,
  ): Promise<IPIDecision> {
    const id = uuidv4();
    const decision: IPIDecision = {
      id,
      toolName,
      content,
      status: "pending",
      timestamp: Date.now(),
      detectedThreat,
      analysisReport,
    };

    this.decisions.set(id, decision);

    return new Promise((resolve) => {
      this.resolvers.set(id, resolve);
    });
  }

  /**
   * ID로 특정 결정 조회
   */
  getDecision(id: string): IPIDecision | undefined {
    return this.decisions.get(id);
  }

  /**
   * 보류 중인 모든 결정 조회
   */
  getPendingDecisions(): IPIDecision[] {
    return Array.from(this.decisions.values())
      .filter((d) => d.status === "pending")
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 모든 결정 이력 조회 (최신순)
   */
  getHistory(): IPIDecision[] {
    return Array.from(this.decisions.values()).sort(
      (a, b) => b.timestamp - a.timestamp,
    );
  }

  /**
   * 결정 처리 (사용자 UI 액션)
   * UI에서 허용/차단/마스킹을 선택하면 호출됩니다.
   */
  resolveDecision(id: string, status: IPIDecisionStatus): boolean {
    const decision = this.decisions.get(id);
    const resolve = this.resolvers.get(id);

    if (decision && resolve && decision.status === "pending") {
      decision.status = status;
      resolve(decision);

      // 정리 (Cleanup)
      this.resolvers.delete(id);
      // 참고: 이력을 남기기 위해 decisions 맵에서는 삭제하지 않음.

      return true;
    }
    return false;
  }
}

export const ipiDecisionStore = new IPIDecisionStore();
