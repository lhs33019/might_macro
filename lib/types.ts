/**
 * lib/types.ts — 프론트 ↔ 백 API 계약 (Contract, Frozen)
 *
 * 이 파일은 /api/* Route Handler(백)와 컴포넌트(프론트)가
 * 함께 import하는 단일 진실 출처(SSoT)다.
 *
 * 규칙:
 *   - 이 파일의 타입을 바꾸면 백·프론트 양쪽을 동시에 수정해야 한다.
 *   - JSON 키는 camelCase (DB snake_case ↔ 변환은 백엔드 내부에서 처리).
 *   - 모든 필드는 readonly — 응답 객체를 변이하지 않는다.
 *   - 파생 지표(mom, yoy, surprise)는 DB에 저장하지 않고 백엔드에서 계산해 내려준다.
 */

// ─────────────────────────────────────────────
// 공통 열거형
// ─────────────────────────────────────────────

export type SeasonalAdj = 'SA' | 'NSA'

// ─────────────────────────────────────────────
// 추세 인사이트 태그 (시리즈 탐색 고도화)
// ─────────────────────────────────────────────

/**
 * 시리즈 가격 추이 특징 태그.
 * 주 상태(상승/하락 × 가속/둔화/지속 + 횡보) + 보조(추세반전·10년최고·10년최저).
 */
export type SeriesTag =
  | '상승가속' | '상승둔화' | '상승지속'
  | '하락가속' | '하락둔화' | '하락지속'
  | '횡보' | '추세반전' | '10년최고' | '10년최저'

/** classifyTrend 입력 — DB series_trend_metrics() 행에서 매핑 */
export interface TrendMetrics {
  readonly yoy: number | null        // 최신 YoY (%)
  readonly yoy3m: number | null      // 3개월 전 시점의 YoY (%)
  readonly yoy6m: number | null      // 6개월 전 시점의 YoY (%)
  readonly mom: number | null        // 최신 MoM (%)
  readonly mom1m: number | null      // 1개월 전 MoM (%)
  readonly mom2m: number | null      // 2개월 전 MoM (%)
  readonly yoyMin10y: number | null  // 10년 윈도우 내 YoY 최소 (%)
  readonly yoyMax10y: number | null  // 10년 윈도우 내 YoY 최대 (%)
}

/** classifyTrend 출력 */
export interface TrendResult {
  readonly state: SeriesTag | null   // 주 상태 1개 (데이터 부족 시 null)
  readonly tags: readonly SeriesTag[] // 주 상태 + 보조 태그
  readonly deltaYoy: number | null   // 가속도 = yoy - yoy3m (%p)
}

/** 머신 리더블 에러 코드 — 프론트에서 분기 처리에 사용 */
export type ApiErrorCode =
  | 'SERIES_NOT_FOUND'       // 요청한 series_id 없음
  | 'OBSERVATION_NOT_FOUND'  // 해당 시리즈 관측값 없음
  | 'INVALID_CATEGORY'       // 허용되지 않는 category 값
  | 'INVALID_PARAMS'         // 쿼리 파라미터 형식 오류
  | 'DB_ERROR'               // Supabase 조회 실패
  | 'INTERNAL_ERROR'         // 서버 내부 오류

// ─────────────────────────────────────────────
// 에러 응답 (모든 /api/* 공통)
// ─────────────────────────────────────────────

export interface ApiError {
  readonly error: {
    readonly code: ApiErrorCode
    readonly message: string  // 사람이 읽는 설명
    readonly status: number   // HTTP 상태 코드 (400 | 404 | 500 ...)
  }
}

// 타입 가드 — 응답이 에러인지 판별
export function isApiError(res: unknown): res is ApiError {
  return (
    typeof res === 'object' &&
    res !== null &&
    'error' in res &&
    typeof (res as ApiError).error?.code === 'string'
  )
}

// ─────────────────────────────────────────────
// SeriesItem — GET /api/series 의 개별 시리즈
// ─────────────────────────────────────────────

export interface SeriesItem {
  readonly seriesId: string      // FRED series_id (예: "PPIACO")
  readonly title: string         // 사람이 읽는 이름
  readonly units: string         // 단위 (예: "Index 1982=100")
  readonly seasonalAdj: SeasonalAdj
  readonly category: string      // FRED 카테고리 체계 값
  readonly lastUpdated: string   // ISO 8601 (예: "2024-03-15T00:00:00")
}

// ─────────────────────────────────────────────
// SeriesListResponse — GET /api/series 전체 응답
// ─────────────────────────────────────────────

export interface SeriesListResponse {
  readonly data: readonly SeriesItem[]
  readonly total: number           // 필터 적용 후 전체 건수
  readonly filter: {
    readonly category: string | null  // 적용된 카테고리 필터 (null = 전체)
  }
}

// ─────────────────────────────────────────────
// ObservationItem — GET /api/series/{id}/observations
// ─────────────────────────────────────────────

export interface ObservationItem {
  readonly date: string          // ISO 8601, 해당 월 1일 (예: "2024-01-01")
  readonly value: number | null  // 결측은 null (0 대체 금지)
  readonly mom: number | null    // 전월 대비 % (첫 관측은 null)
  readonly yoy: number | null    // 전년 동월 대비 % (12개월 미만 구간은 null)
}

export interface ObservationListResponse {
  readonly seriesId: string
  readonly title: string
  readonly units: string
  readonly seasonalAdj: SeasonalAdj
  readonly data: readonly ObservationItem[]
  readonly range: {
    readonly from: string | null   // 실제 데이터 시작일
    readonly to: string | null     // 실제 데이터 종료일
  }
}

// ─────────────────────────────────────────────
// SeriesWithStats — 시리즈 메타 + 최근 MoM·YoY
// GET /api/series 응답에 사용
// ─────────────────────────────────────────────

export interface SeriesWithStats {
  readonly seriesId: string
  readonly title: string
  readonly units: string
  readonly seasonalAdj: SeasonalAdj
  readonly category: string
  readonly lastUpdated: string
  readonly latestDate: string | null
  readonly latestValue: number | null
  readonly mom: number | null   // 최근 MoM (%)
  readonly yoy: number | null   // 최근 YoY (%)
  readonly ann3m: number | null   // Annualized 3M (3M SAAR, %) — 최근 3개월 연율화
  readonly accel3m: number | null // 실질 가속도 = ann3m − yoy (%p)
  // 추세 인사이트 (서버에서 classifyTrend로 사전 계산)
  readonly tags: readonly SeriesTag[]    // 특징 태그
  readonly trendState: SeriesTag | null  // 주 상태 1개
  readonly deltaYoy: number | null       // ΔYoY(3m, %p)
  readonly yoyMin10y: number | null      // 10년 YoY 최소 (%)
  readonly yoyMax10y: number | null      // 10년 YoY 최대 (%)
}

// ─────────────────────────────────────────────
// TopMover — 상위·하위 이동 시리즈
// ─────────────────────────────────────────────

export interface TopMover {
  readonly seriesId: string
  readonly title: string
  readonly category: string
  readonly value: number
  readonly direction: 'up' | 'down' | 'flat'
}

export interface TopMoversResponse {
  readonly momTop:    readonly TopMover[]   // MoM 상위 5
  readonly momBottom: readonly TopMover[]   // MoM 하위 5
  readonly yoyTop:    readonly TopMover[]   // YoY 상위 5
  readonly yoyBottom: readonly TopMover[]   // YoY 하위 5
  readonly refDate:   string | null         // 기준월
}

// ─────────────────────────────────────────────
// SeriesFullListResponse — GET /api/series 전체 응답
// (기존 SeriesListResponse는 유지)
// ─────────────────────────────────────────────

export interface SeriesFullListResponse {
  readonly data:       readonly SeriesWithStats[]
  readonly movers:     TopMoversResponse
  readonly total:      number
  readonly computedAt: string
}

// ─────────────────────────────────────────────
// 대시보드 (메인 화면) — GET /api/dashboard
// 8개 헤드라인 KPI + Annualized 3M + 실질 가속도 + AI 한줄평
// ─────────────────────────────────────────────

/** 헤드라인 KPI 카드 1장 (Annualized 3M 중심) */
export interface HeadlineKpi {
  readonly seriesId: string
  readonly label: string            // 표시명 ('헤드라인 PPI' 등)
  readonly title: string            // FRED 풀네임
  readonly units: string
  readonly seasonalAdj: SeasonalAdj
  readonly latestDate: string | null
  readonly latestValue: number | null
  readonly mom: number | null
  readonly yoy: number | null
  readonly ann3m: number | null     // 주지표: Annualized 3M (%)
  readonly accel3m: number | null   // 실질 가속도 = ann3m − yoy (%p)
  readonly deltaYoy: number | null  // 기존 ΔYoY(3m, %p)
  readonly tags: readonly SeriesTag[]
  // 시장 컨센서스 대비 (consensus 테이블 — 기준월 일치 시에만)
  readonly consensusYoy: number | null    // 시장 예상 YoY (%, 없으면 null)
  readonly surprise: number | null         // 서프라이즈 = 실측 YoY − 컨센서스 (%p)
  readonly consensusSource: string | null  // 컨센서스 출처 (정확성 표기 — 예: Bloomberg, Demo)
}

/** 히트맵 한 줄 (시리즈 × 최근 N개월 MoM) */
export interface DashboardHeatRow {
  readonly seriesId: string
  readonly label: string
  readonly cells: readonly { readonly date: string; readonly mom: number | null }[]
}

/** 부문 기여도 막대 1개 (Final Demand MoM = Σ weightᵢ × MoMᵢ 분해) */
export interface ContributionItem {
  readonly key: string
  readonly label: string
  readonly value: number          // 기여도(%p) = 상대중요도 × 부문 MoM
  readonly color?: string         // 선택 — 미지정 시 부호(±)로 --up/--down
}

/** AI가 생성한 발표 해석 한줄평 */
export interface DashboardInsight {
  readonly body: string
  readonly model: string
  readonly refDate: string
  readonly generatedAt: string
}

/** 다음 PPI 발표 일정 (release_schedule 테이블 — 적재 시점 저장) */
export interface NextRelease {
  readonly date: string   // 예정 발표일 (YYYY-MM-DD)
  readonly dDay: number   // 오늘 기준 남은 일수 (0 = 오늘 발표)
}

/** 인플레이션 폭(diffusion) — 전체 시리즈 중 상승 비중 */
export interface InflationBreadth {
  readonly momUpPct: number | null  // MoM>0 비중 (%)
  readonly yoyUpPct: number | null  // YoY>0 비중 (%)
  readonly total: number            // 분모(유효 시리즈 수)
}

/** 코어 PCE에 반영되는 PPI 라인 1개 + 압력 종합 */
export interface PcePipelineItem {
  readonly seriesId: string
  readonly label: string
  readonly group: string
  readonly mom: number | null
  readonly ann3m: number | null
  readonly yoy: number | null
}
export interface PcePipeline {
  readonly items: readonly PcePipelineItem[]
  readonly read: 'firming' | 'softening' | 'mixed' | null  // 방향 종합(가중합 아님)
}

/** PPI−CPI 마진 스프레드 1쌍 */
export interface MarginSpreadItem {
  readonly key: string
  readonly label: string
  readonly ppiYoy: number | null
  readonly cpiYoy: number | null
  readonly gap: number | null   // ppiYoy − cpiYoy (%p, 양수=마진 압박)
}
export interface MarginSpread {
  readonly pairs: readonly MarginSpreadItem[]
}

/** 인플레이션 모멘텀 래더 1행 (헤드라인 시리즈별) */
export interface MomentumRow {
  readonly seriesId: string
  readonly label: string
  readonly ann1m: number | null     // 1개월 연율
  readonly ann3m: number | null     // 3개월 연율 (3M SAAR)
  readonly ann6m: number | null     // 6개월 연율
  readonly yoy: number | null       // 12개월
  readonly carryover: number | null // 다음 YoY if MoM=0 (베이스효과 프리뷰)
}

/** 발표일 브리핑 — 신규 지표를 결정적으로 종합한 한눈 요약 */
export interface ReleaseBriefing {
  readonly surpriseBeats: number      // 컨센서스 상회 건수
  readonly surpriseMisses: number     // 컨센서스 하회 건수
  readonly surpriseTotal: number      // 컨센서스 비교 가능 건수
  readonly topAccelLabel: string | null  // 최고 가속 부문
  readonly topAccelValue: number | null  // 그 실질가속도 (%p)
  readonly breadthPct: number | null     // MoM 상승 비중 (%)
  readonly pceRead: 'firming' | 'softening' | 'mixed' | null
  readonly marginRead: 'squeeze' | 'relief' | 'neutral' | null  // 헤드라인 갭 기준
}

export interface DashboardResponse {
  readonly headline:    readonly HeadlineKpi[]      // 8개, HEADLINE_SERIES 순서
  readonly sectorAnn3m: readonly HeadlineKpi[]      // ann3m 내림차순(부문 랭킹 카드용)
  readonly heatmap:     readonly DashboardHeatRow[] // 8개 × 최근 8개월 MoM
  readonly insight:     DashboardInsight | null
  readonly nextRelease: NextRelease | null           // 다음 발표 D-day (없으면 null)
  readonly breadth:     InflationBreadth | null      // 인플레 폭
  readonly pcePipeline: PcePipeline | null           // PPI→PCE 파이프라인
  readonly marginSpread: MarginSpread | null         // PPI−CPI 마진
  readonly momentum:    readonly MomentumRow[]        // 헤드라인 모멘텀 래더
  readonly briefing:    ReleaseBriefing | null        // 발표일 브리핑(종합)
  readonly refDate:     string | null               // 헤드라인 기준월
  readonly computedAt:  string
}
