import { parquetRead } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import { VectorStore } from "../src/lib/ipi/vector-store";
import path from "path";
import fs from "fs";

/**
 * IPI 인덱스 빌드 스크립트
 * Parquet 파일(final_db.parquet)을 읽어서 HNSW 인덱스를 생성하고 저장합니다.
 * 
 * 실행 방법: npx tsx scripts/build-index.ts
 */
async function main() {
    // Parquet 파일 경로 설정
    const parquetPath = path.resolve("data/ipi/final_db.parquet");

    // 파일 존재 여부 확인
    if (!fs.existsSync(parquetPath)) {
        console.error(`Error: Parquet 파일을 찾을 수 없습니다: ${parquetPath}`);
        console.error("스크립트를 실행하기 전에 파일이 존재하는지 확인해주세요.");
        process.exit(1);
    }

    console.log(`Parquet 파일 읽는 중: ${parquetPath}`);

    // 1. 파일을 Node.js Buffer로 읽기
    const buffer = fs.readFileSync(parquetPath);

    // 2. ArrayBuffer로 변환 (hyparquet 라이브러리 요구사항)
    // Node.js Buffer의 내부 메모리를 복사하여 순수 ArrayBuffer 생성
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length);

    // VectorStore 인스턴스 가져오기
    const store = VectorStore.getInstance();

    // 인덱스 초기화 (기존 인덱스가 없으면 새로 생성)
    await store.initialize();

    let count = 0;
    const BATCH_SIZE = 1000; // 한 번에 처리할 데이터 수
    let batch: any[] = [];

    console.log("인덱스 빌드 시작...");

    // Parquet 파일 비동기 읽기
    await new Promise<void>((resolve, reject) => {
        parquetRead({
            file: arrayBuffer,
            rowFormat: 'object',
            compressors: compressors, // ZSTD 압축 지원을 위해 필요
            onComplete: async (data) => {
                console.log(`Parquet 읽기 완료. 총 행 수: ${data.length}`);

                for (const row of data) {
                    // row 구조: { text: string, label: number, original_vector: number[] }

                    const vector = row.original_vector;

                    // 레이블 매핑 (0 -> benign, 1 -> attack)
                    // 스키마에 따르면 label은 INT_8 (0 또는 1)
                    let labelStr = "benign";

                    if (row.label === 1) {
                        labelStr = "attack";
                    }

                    // 벡터 유효성 검사
                    if (vector && (Array.isArray(vector) || vector instanceof Float32Array)) {
                        const vecArray = Array.from(vector as ArrayLike<number>);

                        // 차원 확인 (384차원이어야 함)
                        if (vecArray.length === 384) {
                            batch.push({
                                id: ++count,
                                vector: vecArray,
                                label: labelStr,
                            });
                        }
                    }

                    // 배치 크기에 도달하면 저장소에 추가
                    if (batch.length >= BATCH_SIZE) {
                        await store.addItems(batch);
                        batch = []; // 배치 초기화
                        if (count % 10000 === 0) {
                            console.log(`${count}개 아이템 처리 중...`);
                        }
                    }
                }

                // 남은 데이터 처리
                if (batch.length > 0) {
                    await store.addItems(batch);
                }

                // 인덱스 명시적 저장
                store.save();
                resolve();
            }
        }).catch(reject);
    });

    console.log(`완료! 총 ${count}개 아이템이 인덱싱되었습니다.`);
    console.log(`인덱스 저장 위치: ${path.join(process.cwd(), "data", "ipi")}`);
}

main().catch(console.error);
