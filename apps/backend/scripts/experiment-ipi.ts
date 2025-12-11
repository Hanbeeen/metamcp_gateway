
import { parquetRead } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import { VectorStore } from "../src/lib/ipi/vector-store";
import { LocalEmbeddingService } from "../src/lib/ipi/embedder";
import { IPILLMVerifier } from "../src/lib/ipi/llm-verifier";
import { chunkDenseWindow } from "../src/lib/ipi/middleware";
import path from "path";
import fs from "fs";

/**
 * IPI 탐지 실험 스크립트 (IPI Detection Experiment Script)
 * 
 * 다음 3가지 탐지 전략을 비교 실험합니다:
 * 1. Vector Only: 벡터 유사도(Cosine Similarity)만 사용
 * 2. LLM Only: 벡터 필터링 없이 LLM(GPT) 직접 검증 (비용/시간 소요)
 * 3. Hybrid: 벡터 1차 필터링 + 애매한 구간 LLM 검증 (현재 프로덕션 로직)
 */

interface ExperimentItem {
    id: number;
    text: string;
    label: "attack" | "benign";
    expected: boolean; // true = attack (공격)
}

interface ExperimentResult {
    strategy: string;      // 전략 이름
    precision: number;     // 정밀도
    recall: number;        // 재현율
    f1: number;            // F1 점수
    accuracy: number;      // 정확도
    avgLatency: number;    // 평균 소요 시간 (ms)
    p95Latency: number;    // 상위 95% 소요 시간 (ms)
    totalEvaluated: number;// 총 평가 데이터 수
    blocked: number;       // 차단된 횟수
}

// 설정 (Configuration)
// 사용자 요청: 공격 500개 + 정상 500개 (총 1000개)를 모든 실험에 동일하게 적용
const DATA_PATH = "data/ipi/final_db.parquet";
const TOTAL_SAMPLE_SIZE = 1000; // 공격 500개 + 정상 500개

async function loadData(limit: number): Promise<ExperimentItem[]> {
    const parquetPath = path.resolve(DATA_PATH);
    if (!fs.existsSync(parquetPath)) {
        throw new Error(`데이터 파일을 찾을 수 없습니다: ${parquetPath}`);
    }

    const buffer = fs.readFileSync(parquetPath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length);

    const attacks: ExperimentItem[] = [];
    const benigns: ExperimentItem[] = [];

    await new Promise<void>((resolve, reject) => {
        parquetRead({
            file: arrayBuffer,
            rowFormat: 'object',
            compressors: compressors,
            onComplete: (data) => {
                for (const row of data) {
                    const item: ExperimentItem = {
                        id: (row as any).id || Math.random(),
                        text: (row as any).text,
                        label: (row as any).label === 1 ? "attack" : "benign",
                        expected: (row as any).label === 1
                    };
                    if (item.label === "attack") attacks.push(item);
                    else benigns.push(item);
                }
                resolve();
            }
        }).catch(reject);
    });

    // 균형 잡힌 샘플링 (Balanced sampling)
    const half = Math.floor(limit / 2);
    // 데이터 섞기 (Shuffle)
    attacks.sort(() => .5 - Math.random());
    benigns.sort(() => .5 - Math.random());

    // 데이터가 부족할 경우 경고
    if (attacks.length < half || benigns.length < half) {
        console.warn(`경고: 요청된 데이터 수(${half})보다 실제 데이터가 적습니다. (공격: ${attacks.length}, 정상: ${benigns.length})`);
    }

    return [
        ...attacks.slice(0, half),
        ...benigns.slice(0, half)
    ].sort(() => .5 - Math.random());
}

async function runStrategy(
    name: string,
    items: ExperimentItem[],
    strategyFn: (text: string) => Promise<boolean>
): Promise<ExperimentResult> {
    console.log(`\n[실험 시작] 전략: ${name} (데이터 수: ${items.length})`);

    let tp = 0, fp = 0, tn = 0, fn = 0;
    const latencies: number[] = [];
    const total = items.length;

    for (let i = 0; i < total; i++) {
        const item = items[i];
        const start = performance.now();

        try {
            const detected = await strategyFn(item.text);
            const duration = performance.now() - start;
            latencies.push(duration);

            if (detected && item.expected) tp++;       // True Positive (공격을 공격으로 탐지)
            else if (detected && !item.expected) fp++; // False Positive (정상을 공격으로 오탐)
            else if (!detected && !item.expected) tn++;// True Negative (정상을 정상으로 판단)
            else if (!detected && item.expected) fn++; // False Negative (공격을 정상으로 미탐)

            process.stdout.write(`\r진행률: ${i + 1}/${total} | TP:${tp} FP:${fp} TN:${tn} FN:${fn}`);
        } catch (e) {
            console.error(`아이템 ${item.id} 처리 중 오류 발생:`, e);
        }
    }
    console.log(""); // 줄바꿈

    const precision = tp / (tp + fp) || 0;
    const recall = tp / (tp + fn) || 0;
    const f1 = 2 * (precision * recall) / (precision + recall) || 0;
    const accuracy = (tp + tn) / total;

    // 레이턴시 통계 계산
    latencies.sort((a, b) => a - b);
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p95Latency = latencies[Math.floor(latencies.length * 0.95)] || 0;

    return {
        strategy: name,
        precision,
        recall,
        f1,
        accuracy,
        avgLatency,
        p95Latency,
        totalEvaluated: total,
        blocked: tp + fp
    };
}

async function main() {
    console.log("IPI 탐지 실험 초기화 중...");
    console.log(`설정: 총 ${TOTAL_SAMPLE_SIZE}개 (공격 500 + 정상 500) 샘플 사용`);

    // 서비스 초기화
    const vectorStore = VectorStore.getInstance();
    await vectorStore.initialize();
    const embedder = LocalEmbeddingService.getInstance();
    const llmVerifier = IPILLMVerifier.getInstance();

    // 데이터 로드
    const fullDataset = await loadData(TOTAL_SAMPLE_SIZE);

    // 실험 1: Vector Only (벡터 전용)
    // 0.85를 단독 임계값으로 사용하여 성능 측정
    const runVectorOnly = async (text: string) => {
        const chunks = chunkDenseWindow(text);
        if (chunks.length === 0) return false;

        let vectors: number[][];
        if (chunks.length === 1) vectors = [await embedder.getEmbedding(chunks[0])];
        else vectors = await embedder.getEmbeddings(chunks);

        const res = await vectorStore.searchRisk(vectors);
        return res.score > 0.85; // 단독 사용 기준 임계값
    };

    // 실험 2: LLM Only (LLM 전용)
    const runLLMOnly = async (text: string) => {
        // 벡터 필터링 없이 직접 LLM을 호출하여 검증
        const res = await llmVerifier.verifyContent(text, "실험: LLM Only");
        return res.isAttack;
    };

    // 실험 3: Hybrid (하이브리드 - 현재 프로덕션 로직)
    const runHybrid = async (text: string) => {
        const chunks = chunkDenseWindow(text);
        if (chunks.length === 0) return false;

        let vectors: number[][];
        if (chunks.length === 1) vectors = [await embedder.getEmbedding(chunks[0])];
        else vectors = await embedder.getEmbeddings(chunks);

        const res = await vectorStore.searchRisk(vectors);

        // 미들웨어 로직과 동일하게 적용
        // 1. 고위험군 즉시 차단 (> 0.87)
        if (res.score > 0.87) return true;

        // 2. 애매한 구간 LLM 검증 (0.55 ~ 0.87)
        if (res.score >= 0.55) {
            const verification = await llmVerifier.verifyContent(text, "실험: Hybrid", res.score);
            return verification.isAttack;
        }

        // 3. 그 외 안전 (< 0.55)
        return false;
    };

    // 실험 실행 (Execute Experiments)
    const results: ExperimentResult[] = [];

    // 1. Vector Only
    results.push(await runStrategy("Vector Only (유사도 > 0.85)", fullDataset, runVectorOnly));

    // 2. LLM Only (전체 데이터셋 - 주의: 비용 발생)
    console.warn("주의: LLM Only 실험은 전체 데이터셋에 대해 OpenAI API를 호출합니다. 시간이 오래 걸릴 수 있습니다.");
    results.push(await runStrategy("LLM Only (Direct Check)", fullDataset, runLLMOnly));

    // 3. Hybrid (전체 데이터셋)
    results.push(await runStrategy("Hybrid (Vector + LLM)", fullDataset, runHybrid));


    // 결과 출력 (Print Results)
    console.log("\n\n=== IPI 탐지 실험 결과 (IPI Detection Experiment Results) ===");
    console.table(results.map(r => ({
        "전략 (Strategy)": r.strategy,
        "정확도 (Acc)": (r.accuracy * 100).toFixed(1) + "%",
        "정밀도 (Precision)": (r.precision * 100).toFixed(1) + "%",
        "재현율 (Recall)": (r.recall * 100).toFixed(1) + "%",
        "F1 점수": (r.f1 * 100).toFixed(1) + "%",
        "평균 시간": r.avgLatency.toFixed(2) + "ms",
        "P95 시간": r.p95Latency.toFixed(2) + "ms",
        "차단율": ((r.blocked / r.totalEvaluated) * 100).toFixed(1) + "%"
    })));
}

main().catch(console.error);
