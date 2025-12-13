import { pipeline } from "@huggingface/transformers";
import { parquetRead } from "hyparquet";
import { compressors } from "hyparquet-compressors";
import path from "path";
import fs from "fs";
import { performance } from "perf_hooks";

// ==============================================================================
// 1. 설정: 경로 및 모델
// ==============================================================================
const PARQUET_FILE_PATH = path.join("data", "ipi", "sampled_benchmark_1000.parquet");
const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

async function loadParquetData(filePath: string): Promise<string[]> {
    console.log(`📂 Parquet 파일 읽는 중: ${filePath}`);

    if (!fs.existsSync(filePath)) {
        throw new Error(`❌ 파일을 찾을 수 없습니다: ${filePath}\n   경로를 다시 확인해주세요.`);
    }

    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    return new Promise((resolve, reject) => {
        parquetRead({
            file: arrayBuffer,
            compressors: compressors,
            onComplete: (data: any) => {
                // [수정 포인트]
                // data가 배열(Array)인 경우를 처리합니다.
                // 오류 로그의 "0, 1, 2..."는 data가 행(Row)들의 배열이라는 뜻입니다.

                const texts: string[] = [];

                if (Array.isArray(data)) {
                    // 데이터가 배열(행 리스트)로 들어온 경우
                    console.log(`🔍 ${data.length}개의 행(Row)을 감지했습니다.`);

                    for (const row of data) {
                        // 각 행에서 텍스트 필드를 찾습니다.
                        // 배열 형태일 수도 있고, 객체 형태일 수도 있으니 안전하게 체크
                        let val = null;
                        if (typeof row === 'object' && row !== null) {
                            val = row.text || row.instruction || row.content || row.prompt || row[0];
                        }

                        if (val) texts.push(String(val));
                    }
                } else {
                    // 기존 로직: 데이터가 컬럼 중심 객체인 경우 ({ text: [...], label: [...] })
                    const columns = Object.keys(data);
                    const textColumn = columns.find(col =>
                        ['text', 'instruction', 'content', 'prompt'].includes(col)
                    );

                    if (textColumn && Array.isArray(data[textColumn])) {
                        texts.push(...data[textColumn].map(String));
                    }
                }

                if (texts.length > 0) {
                    console.log(`✅ 텍스트 추출 완료: ${texts.length}건`);
                    resolve(texts);
                } else {
                    reject(new Error(`❌ 텍스트 데이터를 찾을 수 없습니다. 데이터 구조를 확인해주세요.`));
                }
            }
        }).catch((err) => {
            reject(new Error(`❌ Parquet 파싱 실패: ${err.message}`));
        });
    });
}

async function runBenchmark() {
    console.log("\n🚀 [Real Data Embedding Benchmark] Node.js + ONNX (hyparquet)");
    console.log("==============================================================");

    // 1. 데이터 로드
    let samples: string[] = [];
    try {
        samples = await loadParquetData(PARQUET_FILE_PATH);
    } catch (e: any) {
        console.error(e.message);
        console.log("⚠️ 더미 데이터로 테스트합니다.");
        samples = Array(100).fill("This is a dummy sentence for benchmarking.");
    }

    if (samples.length === 0) return;

    // 2. 모델 로딩
    console.log(`\n⏳ 모델 로딩 중: ${MODEL_NAME}...`);
    const extractor = await pipeline("feature-extraction", MODEL_NAME, {
        quantized: true,
    });
    console.log("✅ 모델 로딩 완료!");

    // 3. Warm-up
    console.log("🔥 웜업 (Warm-up)...");
    await extractor(samples[0], { pooling: "mean", normalize: true });

    // 4. 측정 시작
    console.log(`\n📊 벤치마크 시작 (총 ${samples.length}건)...`);

    const latencies: number[] = [];
    const startTotal = performance.now();

    for (let i = 0; i < samples.length; i++) {
        const start = performance.now();
        await extractor(samples[i], { pooling: "mean", normalize: true });
        const end = performance.now();

        latencies.push(end - start);

        if ((i + 1) % 100 === 0) process.stdout.write(".");
    }
    const endTotal = performance.now();
    console.log("\n");

    // 5. 결과 계산
    const totalTime = endTotal - startTotal;
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const min = Math.min(...latencies);
    const max = Math.max(...latencies);

    // P99 계산
    const sorted = [...latencies].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(latencies.length * 0.95)];
    const p99 = sorted[Math.floor(latencies.length * 0.99)];

    console.log("\n🏆 [최종 성능 리포트 - Node.js 실측]");
    console.log(`----------------------------------------`);
    console.log(`데이터 수       : ${samples.length} 개`);
    console.log(`총 소요 시간    : ${(totalTime / 1000).toFixed(2)} 초`);
    console.log(`----------------------------------------`);
    console.log(`Average Latency : ${avg.toFixed(2)} ms  👈 (보고서용 수치)`);
    console.log(`Min Latency     : ${min.toFixed(2)} ms`);
    console.log(`Max Latency     : ${max.toFixed(2)} ms`);
    console.log(`P95 Latency     : ${p95.toFixed(2)} ms`);
    console.log(`P99 Latency     : ${p99.toFixed(2)} ms`);
    console.log(`----------------------------------------`);
}

runBenchmark();