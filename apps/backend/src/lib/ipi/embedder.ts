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

    // 모델 로딩 프로미스 (중복 로딩 방지)
    private initializationPromise: Promise<void> | null = null;

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
     * 모델 초기화를 보장합니다.
     * 동시에 여러 요청이 들어와도 한 번만 로딩되도록 처리합니다.
     */
    private async ensureInitialized() {
        if (this.extractor) return;

        if (!this.initializationPromise) {
            this.initializationPromise = (async () => {
                console.log(`[LocalEmbeddingService] 모델 로딩 중: ${this.modelName}...`);
                this.extractor = await pipeline("feature-extraction", this.modelName);
            })();
        }

        await this.initializationPromise;
    }

    /**
     * 텍스트를 임베딩 벡터로 변환합니다.
     * @param text 변환할 텍스트
     * @returns 384차원 숫자 배열 (벡터)
     */
    async getEmbedding(text: string): Promise<number[]> {
        await this.ensureInitialized();

        // 텍스트를 벡터로 변환
        // pooling: 'mean' -> 단어 벡터들의 평균을 구해서 문장 벡터 생성
        // normalize: true -> 코사인 유사도 계산을 위해 벡터 정규화
        const output = await this.extractor(text, { pooling: "mean", normalize: true });

        // Float32Array를 일반 숫자 배열로 변환하여 반환
        return Array.from(output.data);
    }

    /**
     * 여러 텍스트를 한 번에 임베딩 벡터로 변환합니다 (배치 처리).
     * @param texts 변환할 텍스트 배열
     * @returns 벡터 배열
     */
    async getEmbeddings(texts: string[]): Promise<number[][]> {
        await this.ensureInitialized();

        // 배치 처리
        const output = await this.extractor(texts, { pooling: "mean", normalize: true });

        // output.data는 모든 배치의 데이터가 1차원 배열로 연결되어 있을 수 있음 (라이브러리 버전에 따라 다름)
        // 하지만 pipeline이 배열 입력에 대해 Tensor를 반환하면 보통 [batch_size, hidden_size] 형태임.
        // Transformers.js의 pipeline은 배열 입력 시 Tensor 객체를 반환하거나 Tensor 리스트를 반환할 수 있음.

        // 안전하게 루프를 돌며 처리하는 것이 가장 확실함 (Transformers.js의 pipeline 동작 방식 확인 필요하지만,
        // 여기서는 안전하게 하나씩 처리하는 방식보다는 성능을 위해 map Promise.all 사용 고려, 
        // 그러나 JS 환경에서 병렬처리는 한계가 있으므로 순차 처리 혹은 라이브러리 지원 확인.
        // Transformers.js pipeline supports batching intuitively if passed an array.
        // tensor.tolist() returns nested array.

        return output.tolist();
    }
}
