
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { parquetRead } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import pLimit from "p-limit";

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

interface ExperimentDetail {
    id: number;
    text: string;
    label: "attack" | "benign";
    expected: boolean;
    predicted: boolean;
    correct: boolean;
    latency: number;
    vectorScore?: number;  // 벡터 유사도 점수
    llmReason?: string;    // LLM 판단 근거
    fullReport?: any;      // LLM 상세 분석 결과
}

interface VerificationResult {
    isAttack: boolean;
    score?: number;
    reason?: string;
    fullReport?: any;
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
    details: ExperimentDetail[]; // 상세 결과 (저장용)
}

// 설정 (Configuration)
const DATA_PATH = "data/ipi/sampled_benchmark_1000.parquet";
const TOTAL_SAMPLE_SIZE = 1000; // 사용자 요청에 따라 1000개로 복원

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
                    const r = row as any;
                    // 데이터 포맷 대응: text, label(str), label_int(i8)
                    // label_int가 1이면 공격, 혹은 label이 "jailbreak"면 공격
                    const isAttack = r.label_int === 1 || r.label === "jailbreak" || r.label === "attack";

                    const item: ExperimentItem = {
                        id: Math.random(), // ID 컬럼이 없으면 랜덤 생성
                        text: r.text,
                        label: isAttack ? "attack" : "benign",
                        expected: isAttack
                    };
                    if (isAttack) attacks.push(item);
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
    strategyFn: (text: string) => Promise<VerificationResult>
): Promise<ExperimentResult> {
    console.log(`\n[실험 시작] 전략: ${name} (데이터 수: ${items.length})`);

    let tp = 0, fp = 0, tn = 0, fn = 0;
    const latencies: number[] = [];
    const details: ExperimentDetail[] = [];
    const total = items.length;
    let completed = 0;

    // 동시 실행 제한 (Rate Limit 방지 및 시스템 부하 조절)
    // - Vector Only: CPU/메모리 부하 고려 50개
    // - LLM 포함: API Rate Limit 고려 10~20개 (gpt-4o-mini 기준 넉넉함)
    const concurrency = name.includes("Vector") ? 1 : 10;
    const limit = pLimit(concurrency);

    const tasks = items.map((item) => limit(async () => {
        const start = performance.now();
        try {
            const result = await strategyFn(item.text);
            const duration = performance.now() - start;

            return {
                item,
                result,
                duration,
                success: true
            };
        } catch (e) {
            console.error(`아이템 ${item.id} 처리 중 오류 발생:`, e);
            return {
                item,
                result: { isAttack: false, score: 0, reason: "Error" }, // 실패 시 기본값 처리
                duration: 0,
                success: false
            };
        } finally {
            completed++;
            if (completed % 10 === 0 || completed === total) {
                process.stdout.write(`\r진행률: ${completed}/${total} (${((completed / total) * 100).toFixed(1)}%)`);
            }
        }
    }));

    const results = await Promise.all(tasks);

    // 결과 집계
    for (const r of results) {
        if (!r.success) continue;

        const { item, result, duration } = r;
        const detected = result.isAttack;

        latencies.push(duration);
        const isCorrect = detected === item.expected;

        details.push({
            id: item.id,
            text: item.text,
            label: item.label,
            expected: item.expected,
            predicted: detected,
            correct: isCorrect,
            latency: duration,
            vectorScore: result.score,
            llmReason: result.reason,
            fullReport: result.fullReport,
        });

        if (detected && item.expected) tp++;
        else if (detected && !item.expected) fp++;
        else if (!detected && !item.expected) tn++;
        else if (!detected && item.expected) fn++;
    }

    console.log(`\n완료: TP:${tp} FP:${fp} TN:${tn} FN:${fn}`);

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
        blocked: tp + fp,
        details
    };
}

async function main() {
    console.log("IPI 탐지 실험 초기화 중...");

    // .env 파일 로드 (현재 위치 및 상위 디렉토리 탐색)
    const possiblePaths = [
        path.resolve(process.cwd(), ".env"),
        path.resolve(process.cwd(), "..", ".env"),
        path.resolve(process.cwd(), "..", "..", ".env"),
    ];

    let envLoaded = false;
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            console.log(`Loading .env from: ${p}`);
            dotenv.config({ path: p });
            envLoaded = true;
            break;
        }
    }

    if (!envLoaded) {
        console.warn("⚠️  .env file not found. Environment variables might be missing.");
    }

    // DB 연결 에러 방지용 더미 값 설정
    if (!process.env.DATABASE_URL) {
        process.env.DATABASE_URL = "postgres://dummy:5432/db";
    }

    // 애플리케이션 모듈은 환경변수 설정 후 동적으로 임포트해야 합니다.
    const { VectorStore } = await import("../src/lib/ipi/vector-store");
    const { LocalEmbeddingService } = await import("../src/lib/ipi/embedder");
    const { IPILLMVerifier } = await import("../src/lib/ipi/llm-verifier");
    const { chunkDenseWindow } = await import("../src/lib/ipi/middleware");

    console.log(`설정: 총 ${TOTAL_SAMPLE_SIZE}개 (공격 ${Math.floor(TOTAL_SAMPLE_SIZE / 2)} + 정상 ${Math.ceil(TOTAL_SAMPLE_SIZE / 2)}) 샘플 사용`);

    // 서비스 초기화
    const vectorStore = VectorStore.getInstance();
    await vectorStore.initialize();
    const embedder = LocalEmbeddingService.getInstance();
    const llmVerifier = IPILLMVerifier.getInstance();

    // 데이터 로드
    const fullDataset = await loadData(TOTAL_SAMPLE_SIZE);

    // API Key 로드
    const KEY_LLM_ONLY = process.env.OPENAI_API_KEY_LLM_ONLY || process.env.OPENAI_API_KEY || "";
    const KEY_HYBRID = process.env.OPENAI_API_KEY_HYBRID || process.env.OPENAI_API_KEY || "";

    if (!KEY_LLM_ONLY || !KEY_HYBRID) {
        console.warn("⚠️  경고: API Key가 설정되지 않았을 수 있습니다.");
    }

    // 실험 1: Vector Only (벡터 전용)
    const runVectorOnly = async (text: string): Promise<VerificationResult> => {
        const chunks = chunkDenseWindow(text);
        if (chunks.length === 0) return { isAttack: false, score: 0 };

        let vectors: number[][];
        if (chunks.length === 1) vectors = [await embedder.getEmbedding(chunks[0])];
        else vectors = await embedder.getEmbeddings(chunks);

        const res = await vectorStore.searchRisk(vectors);
        return {
            isAttack: res.score > 0.85,
            score: res.score,
            reason: "Vector Only Threshold > 0.85"
        };
    };

    // 실험 2: LLM Only (LLM 전용)
    const runLLMOnly = async (text: string): Promise<VerificationResult> => {
        const res = await llmVerifier.verifyContent(text, "실험: LLM Only");
        return {
            isAttack: res.isAttack,
            score: res.score,
            reason: res.reason,
            fullReport: res.structuredAnalysis
        };
    };

    // 실험 3: Hybrid Standard (No Few-shot)
    const runHybridStandard = async (text: string): Promise<VerificationResult> => {
        const chunks = chunkDenseWindow(text);
        if (chunks.length === 0) return { isAttack: false, score: 0 };

        let vectors: number[][];
        if (chunks.length === 1) vectors = [await embedder.getEmbedding(chunks[0])];
        else vectors = await embedder.getEmbeddings(chunks);

        const res = await vectorStore.searchRisk(vectors);

        if (res.score > 0.87) return { isAttack: true, score: res.score, reason: "Vector High Confidence" };
        if (res.score >= 0.55) {
            const verification = await llmVerifier.verifyContent(text, "실험: Hybrid (No Few-shot)", res.score);
            return {
                isAttack: verification.isAttack,
                score: res.score, // 벡터 점수 유지
                reason: `LLM Verdict (${verification.reason})`,
                fullReport: verification.structuredAnalysis
            };
        }
        return { isAttack: false, score: res.score, reason: "Vector Low Confidence" };
    };

    // 실험 4: Hybrid Few-Shot (With Similar Attacks)
    const runHybridFewShot = async (text: string): Promise<VerificationResult> => {
        const chunks = chunkDenseWindow(text);
        if (chunks.length === 0) return { isAttack: false, score: 0 };

        let vectors: number[][];
        if (chunks.length === 1) vectors = [await embedder.getEmbedding(chunks[0])];
        else vectors = await embedder.getEmbeddings(chunks);

        const res = await vectorStore.searchRisk(vectors);

        if (res.score > 0.87) return { isAttack: true, score: res.score, reason: "Vector High Confidence" };
        if (res.score >= 0.55) {
            const verification = await llmVerifier.verifyContentWithFewShot(
                text,
                "실험: Hybrid (Few-shot)",
                res.score,
                res.similarAttacks || []
            );
            return {
                isAttack: verification.isAttack,
                score: res.score,
                reason: `LLM Few-Shot Verdict (${verification.reason})`,
                fullReport: verification.structuredAnalysis
            };
        }
        return { isAttack: false, score: res.score, reason: "Vector Low Confidence" };
    };

    // 실험 실행 (Execute Experiments)
    const results: ExperimentResult[] = [];

    // 1. Vector Only
    results.push(await runStrategy("Vector Only (유사도 > 0.85)", fullDataset, runVectorOnly));

    // 2. LLM Only (전체 데이터셋 - 주의: 비용 발생)
    // 필요 시 주석 해제하여 사용
    // console.warn("LLM Only 실험 시작...");
    if (KEY_LLM_ONLY) {
        llmVerifier.setApiKey(KEY_LLM_ONLY);
        results.push(await runStrategy("LLM Only (Direct Check)", fullDataset, runLLMOnly));
    }

    // 3. Hybrid Standard
    if (KEY_HYBRID) {
        llmVerifier.setApiKey(KEY_HYBRID);
    }
    results.push(await runStrategy("Hybrid (No Few-shot)", fullDataset, runHybridStandard));

    // 4. Hybrid Few-Shot
    results.push(await runStrategy("Hybrid (With Few-shot)", fullDataset, runHybridFewShot));


    // 결과 출력
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

    // 결과 저장
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputDir = path.resolve("data/experiments");
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // 요약 데이터 CSV 저장
    const summaryCsv = [
        "Strategy,Accuracy,Precision,Recall,F1,AvgLatency,P95Latency,BlockedRate",
        ...results.map(r => [
            r.strategy,
            r.accuracy,
            r.precision,
            r.recall,
            r.f1,
            r.avgLatency,
            r.p95Latency,
            r.blocked / r.totalEvaluated
        ].join(","))
    ].join("\n");

    fs.writeFileSync(path.join(outputDir, `summary_${timestamp}.csv`), summaryCsv);
    console.log(`\n📄 요약 데이터 저장 완료: data/experiments/summary_${timestamp}.csv`);

    // 상세 데이터 JSON 저장
    const detailsData = results.map(r => ({
        strategy: r.strategy,
        metrics: {
            accuracy: r.accuracy,
            precision: r.precision,
            recall: r.recall,
            f1: r.f1,
            avgLatency: r.avgLatency
        },
        details: r.details
    }));

    fs.writeFileSync(path.join(outputDir, `details_${timestamp}.json`), JSON.stringify(detailsData, null, 2));
    console.log(`📄 상세 데이터 저장 완료: data/experiments/details_${timestamp}.json`);
}

main().catch(console.error);