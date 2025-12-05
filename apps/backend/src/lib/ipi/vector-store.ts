import hnswlib from "hnswlib-node";
import fs from "fs";
import path from "path";
import { IPIVectorData, IPIDetectionResult } from "./types";

/**
 * 벡터 저장소 (Vector Store) 클래스
 * HNSW (Hierarchical Navigable Small World) 알고리즘을 사용하여 벡터 검색을 수행합니다.
 * 싱글톤 패턴으로 구현되어 애플리케이션 전체에서 하나의 인덱스 인스턴스를 공유합니다.
 */
export class VectorStore {
    private static instance: VectorStore;
    private index: hnswlib.HierarchicalNSW | null = null;

    // 메타데이터 저장소: ID -> { label }
    // 메모리 절약을 위해 riskScore는 저장하지 않고 label로 판단합니다.
    private metadataMap: Map<number, { label: string }> = new Map();

    private readonly dataDir: string;
    private readonly indexFile: string;
    private readonly metaFile: string;
    private readonly dimension: number = 384; // 임베딩 모델(all-MiniLM-L6-v2)의 차원 수
    private readonly maxElements: number = 400000; // 최대 저장 가능 요소 수 (36만개 데이터셋 대응)

    private constructor() {
        // 데이터 저장 경로 설정 (apps/backend/data/ipi)
        this.dataDir = path.resolve(process.cwd(), "data", "ipi");
        this.indexFile = path.join(this.dataDir, "ipi.index");
        this.metaFile = path.join(this.dataDir, "ipi_meta.json");
    }

    /**
     * 인스턴스 가져오기 (싱글톤)
     */
    public static getInstance(): VectorStore {
        if (!VectorStore.instance) {
            VectorStore.instance = new VectorStore();
        }
        return VectorStore.instance;
    }

    /**
     * 벡터 저장소 초기화
     * 기존 인덱스 파일이 있으면 로드하고, 없으면 새로 생성합니다.
     */
    async initialize() {
        if (this.index) return;

        // 데이터 디렉토리가 없으면 생성
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }

        // HNSW 인덱스 객체 생성 (코사인 유사도 사용)
        this.index = new hnswlib.HierarchicalNSW("cosine", this.dimension);

        console.log(`[VectorStore] 인덱스 파일 확인 중: ${this.indexFile}`);
        console.log(`[VectorStore] 메타데이터 파일 확인 중: ${this.metaFile}`);

        // 파일이 존재하면 로드 시도
        if (fs.existsSync(this.indexFile) && fs.existsSync(this.metaFile)) {
            console.log("[VectorStore] 기존 IPI 인덱스 로딩 중...");
            try {
                this.index.readIndexSync(this.indexFile);
                this.loadMetadata();
            } catch (err) {
                console.error("[VectorStore] 인덱스 로딩 실패, 새로 생성합니다:", err);
                this.index.initIndex(this.maxElements);
            }
        } else {
            console.log("[VectorStore] 새 IPI 인덱스 생성 중...");
            this.index.initIndex(this.maxElements);
        }
    }

    /**
     * 메타데이터(ID -> Label) 로드
     */
    private loadMetadata() {
        try {
            const data = fs.readFileSync(this.metaFile, "utf-8");
            const parsed = JSON.parse(data);
            // JSON 객체를 Map으로 변환
            this.metadataMap = new Map();
            for (const [key, value] of Object.entries(parsed)) {
                this.metadataMap.set(Number(key), value as { label: string });
            }
            console.log(`[VectorStore] ${this.metadataMap.size}개의 메타데이터 로드 완료.`);
        } catch (e) {
            console.error("[VectorStore] 메타데이터 로드 실패:", e);
            this.metadataMap = new Map();
        }
    }

    /**
     * 메타데이터 저장
     */
    private saveMetadata() {
        try {
            const obj = Object.fromEntries(this.metadataMap);
            fs.writeFileSync(this.metaFile, JSON.stringify(obj, null, 2));
        } catch (e) {
            console.error("[VectorStore] 메타데이터 저장 실패:", e);
        }
    }

    /**
     * 벡터 데이터 추가 (빌드 시 사용)
     * @param items 추가할 벡터 데이터 배열
     */
    async addItems(items: IPIVectorData[]) {
        if (!this.index) await this.initialize();

        for (const item of items) {
            try {
                this.index!.addPoint(item.vector, item.id);
                this.metadataMap.set(item.id, {
                    label: item.label,
                });
            } catch (e) {
                console.error(`[VectorStore] 아이템 추가 실패 (ID: ${item.id}):`, e);
            }
        }
    }

    /**
     * 인덱스와 메타데이터를 디스크에 저장
     */
    public save() {
        if (!this.index) return;
        try {
            this.index.writeIndexSync(this.indexFile);
            this.saveMetadata();
            console.log(`[VectorStore] 인덱스와 메타데이터가 ${this.dataDir}에 저장되었습니다.`);
        } catch (e) {
            console.error("[VectorStore] 인덱스 저장 실패:", e);
        }
    }

    /**
     * 위험도 분석 (IPI 탐지 핵심 로직)
     * 여러 청크(벡터)에 대해 k-NN 검색을 수행하고 가중치 투표로 위험도를 계산합니다.
     * 
     * @param queryVectors 분석할 텍스트의 청크 벡터 배열
     * @param k 검색할 이웃 수 (기본값 10)
     * @returns 탐지 결과 (detected, score, reason)
     */
    async searchRisk(queryVectors: number[][], k = 10): Promise<IPIDetectionResult> {
        if (!this.index) await this.initialize();

        try {
            const chunkScores: number[] = []; // 각 청크별 위험 점수
            const allReasons: string[] = []; // 탐지된 이유들

            for (const vector of queryVectors) {
                // k-NN 검색 수행 (가장 가까운 k개의 이웃 찾기)
                // result.neighbors: 이웃 ID 배열
                // result.distances: 이웃과의 거리 배열 (코사인 거리)
                const result = this.index!.searchKnn(vector, k);

                let attackWeight = 0; // 공격 레이블 가중치 합
                let totalWeight = 1e-10; // 전체 가중치 합 (0으로 나누기 방지)
                const chunkReasons: string[] = [];

                for (let i = 0; i < result.neighbors.length; i++) {
                    const id = result.neighbors[i];
                    const distance = result.distances[i];
                    const similarity = 1 - distance; // 코사인 유사도로 변환 (1에 가까울수록 유사)

                    const meta = this.metadataMap.get(id);
                    if (!meta) continue;

                    // 가중치 투표 로직
                    // 유사도가 높을수록 투표에 더 큰 영향을 줌
                    const isAttack = meta.label === "attack";

                    if (isAttack) {
                        attackWeight += similarity;
                        chunkReasons.push(`${meta.label}(${(similarity * 100).toFixed(1)}%)`);
                    }

                    totalWeight += similarity;
                }

                // 청크의 위험 점수 계산 (공격 가중치 / 전체 가중치)
                const score = attackWeight / totalWeight;
                chunkScores.push(score);

                // 위험 점수가 0.5를 넘으면 이유 기록
                if (score > 0.5) {
                    allReasons.push(`Chunk risk ${score.toFixed(2)}: [${chunkReasons.join(", ")}]`);
                }
            }

            // Top-N 평균 (오탐 방지)
            // 가장 높은 점수 상위 N개의 평균을 최종 점수로 사용
            chunkScores.sort((a, b) => b - a); // 내림차순 정렬
            const topN = 5; // 상위 5개 사용 (사용자 수정 반영)
            const topScores = chunkScores.slice(0, topN);

            const finalRisk = topScores.length > 0
                ? topScores.reduce((a, b) => a + b, 0) / topScores.length
                : 0.0;

            // 최종 위험도가 임계값을 넘으면 탐지로 간주
            const isDetected = finalRisk > 0.82; // 임계값 (사용자 수정 반영)

            return {
                detected: isDetected,
                score: finalRisk,
                reason: isDetected ? `High risk patterns: ${allReasons.join("; ")}` : undefined
            };

        } catch (error) {
            console.error("[VectorStore] 검색 중 오류 발생:", error);
            return { detected: false, score: 0 };
        }
    }

    /**
     * 현재 인덱스에 저장된 아이템 수 반환
     */
    public getCount(): number {
        return this.index ? this.index.getCurrentCount() : 0;
    }
}
