import { pipeline } from "@huggingface/transformers";

/**
 * 로컬 임베딩 서비스 클래스
 * Hugging Face의 Transformers.js를 사용하여 텍스트를 벡터로 변환합니다.
 * 싱글톤 패턴을 사용하여 모델을 한 번만 로드하고 재사용합니다.
 */
export class LocalEmbeddingService {
    // 싱글톤 인스턴스 저장소
    private static instance: LocalEmbeddingService;
    // 모델 파이프라인 객체 (처음에는 null)
    private extractor: any = null;
    // 사용할 모델 이름 (가볍고 빠른 all-MiniLM-L6-v2 사용)
    private modelName = "Xenova/all-MiniLM-L6-v2";

    // private 생성자: 외부에서 new LocalEmbeddingService() 호출 방지
    private constructor() { }

    /**
     * 인스턴스 가져오기 (싱글톤 패턴)
     * 이미 생성된 인스턴스가 있으면 반환하고, 없으면 새로 생성합니다.
     */
    public static getInstance(): LocalEmbeddingService {
        if (!LocalEmbeddingService.instance) {
            LocalEmbeddingService.instance = new LocalEmbeddingService();
        }
        return LocalEmbeddingService.instance;
    }

    /**
     * 텍스트를 임베딩 벡터로 변환합니다.
     * @param text 변환할 텍스트
     * @returns 384차원 숫자 배열 (벡터)
     */
    async getEmbedding(text: string): Promise<number[]> {
        // 모델이 로드되지 않았으면 로드합니다.
        if (!this.extractor) {
            console.log(`[LocalEmbeddingService] 모델 로딩 중: ${this.modelName}...`);
            this.extractor = await pipeline("feature-extraction", this.modelName);
        }

        // 텍스트를 벡터로 변환
        // pooling: 'mean' -> 단어 벡터들의 평균을 구해서 문장 벡터 생성
        // normalize: true -> 코사인 유사도 계산을 위해 벡터 정규화
        const output = await this.extractor(text, { pooling: "mean", normalize: true });

        // Float32Array를 일반 숫자 배열로 변환하여 반환
        return Array.from(output.data);
    }
}
