/**
 * IPI (Indirect Prompt Injection) 탐지를 위한 벡터 데이터 인터페이스
 * 벡터 DB에 저장될 데이터의 구조를 정의합니다.
 */
export interface IPIVectorData {
    /** 고유 ID (Parquet 파일의 행 번호 등) */
    id: number;
    /** 임베딩 벡터 (384차원 - all-MiniLM-L6-v2 모델 기준) */
    vector: number[];
    /** 레이블 (예: "attack" - 공격, "benign" - 정상) */
    label: string;
}

/**
 * IPI 탐지 결과 인터페이스
 * 텍스트 분석 후 반환되는 결과 구조입니다.
 */
export interface IPIDetectionResult {
    /** 탐지 여부 (true: 공격 의심, false: 정상) */
    detected: boolean;
    /** 위험 점수 (0.0 ~ 1.0, 높을수록 위험) */
    score: number;
    /** 탐지 사유 (탐지된 경우에만 포함, 예: "High risk patterns: ...") */
    reason?: string;
}
