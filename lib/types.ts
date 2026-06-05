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
// KpiItem — GET /api/kpi 의 개별 KPI 카드 데이터
// ─────────────────────────────────────────────

export interface KpiItem {
  readonly seriesId: string
  readonly title: string
  readonly refDate: string         // 기준 발표월 (예: "2024-02-01")
  readonly latestValue: number     // 최신 지수값 (원본)
  readonly yoy: number | null      // 전년 동월 대비 (%)
  readonly consensusYoy: number | null  // 시장 예상 YoY (%, 없으면 null)
  readonly surprise: number | null      // 실측 YoY - 컨센서스 (없으면 null)
  readonly insight: string | null  // InsightLabel — lib/analytics calcInsight 결과
}

export interface KpiListResponse {
  readonly data: readonly KpiItem[]
  readonly filter: {
    readonly category: string | null
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
}

/** 히트맵 한 줄 (시리즈 × 최근 N개월 MoM) */
export interface DashboardHeatRow {
  readonly seriesId: string
  readonly label: string
  readonly cells: readonly { readonly date: string; readonly mom: number | null }[]
}

/** AI가 생성한 발표 해석 한줄평 */
export interface DashboardInsight {
  readonly body: string
  readonly model: string
  readonly refDate: string
  readonly generatedAt: string
}

export interface DashboardResponse {
  readonly headline:    readonly HeadlineKpi[]      // 8개, HEADLINE_SERIES 순서
  readonly sectorAnn3m: readonly HeadlineKpi[]      // ann3m 내림차순(부문 랭킹 카드용)
  readonly heatmap:     readonly DashboardHeatRow[] // 8개 × 최근 8개월 MoM
  readonly insight:     DashboardInsight | null
  readonly refDate:     string | null               // 헤드라인 기준월
  readonly computedAt:  string
}
