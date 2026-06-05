// 분석 지표 순수 함수 — 부수효과 없음, 단위 테스트 동반 필수
// 공식 출처: CLAUDE.md §8

import type { Observation } from '@/lib/supabase/types'
import type { SeriesTag, TrendMetrics, TrendResult } from '@/lib/types'

/** MoM(%) = (value_t / value_{t-1} - 1) * 100 */
export function calcMoM(current: number, prev: number): number {
  return (current / prev - 1) * 100
}

/** YoY(%) = (value_t / value_{t-12} - 1) * 100 */
export function calcYoY(current: number, prevYear: number): number {
  return (current / prevYear - 1) * 100
}

/** 서프라이즈(p) = 실측 YoY - 컨센서스 YoY */
export function calcSurprise(actualYoy: number, consensusYoy: number): number {
  return actualYoy - consensusYoy
}

/**
 * Annualized 3M (3개월 연율화, 3M SAAR, %)
 *   = ((value_t / value_{t-3})^(12/3) - 1) * 100 = ((latest/prev3m)^4 - 1) * 100
 * 최근 3개월 모멘텀을 연율로 환산 — 시장이 추세 가속/둔화를 빠르게 읽는 핵심 지표.
 * SA 계열에서 의미가 명확하며, NSA 계열은 계절성 주의.
 */
export function calcAnnualized3M(latest: number, prev3m: number): number {
  return (Math.pow(latest / prev3m, 4) - 1) * 100
}

/**
 * 실질 가속도 (%p) = Annualized 3M − YoY
 * 단기 모멘텀(3M 연율)이 12개월 추세(YoY)를 추월(+)/하회(−)하는 폭.
 * 양수면 최근 물가가 연간 추세보다 뜨겁다 → 가속, 음수면 둔화.
 * (기존 ΔYoY = yoy − yoy3m 보다 전환점에 선행·민감 — 검증 완료)
 */
export function calcAccel3M(ann3m: number, yoy: number): number {
  return ann3m - yoy
}

export type InsightLabel =
  | '예상 상회 (상방 서프라이즈)'
  | '예상 부합'
  | '예상 하회 (하방 서프라이즈)'
  | '가속 지속'
  | '둔화 지속'
  | '전년비 재가속'
  | '전년비 둔화'
  | '12개월 내 최고'
  | '12개월 내 최저'
  | '근원 물가 압력 잔존'
  | null

interface InsightInput {
  currentYoy: number
  prevYoy: number
  recentMoMs: number[]       // 최신순 [t, t-1, t-2, ...]
  last12Yoys: number[]       // 최근 12개월 YoY
  consensusYoy?: number | null
  coreYoy?: number | null    // R5용
  headlineYoy?: number | null // R5용
}

// PRD §6.3 R1~R5 규칙 세트 — 우선순위 높은 순
export function calcInsight(input: InsightInput): InsightLabel {
  const { currentYoy, prevYoy, recentMoMs, last12Yoys, consensusYoy, coreYoy, headlineYoy } =
    input

  // R1 서프라이즈 (컨센서스 있을 때만)
  if (consensusYoy != null) {
    const surprise = calcSurprise(currentYoy, consensusYoy)
    if (surprise >= 0.2) return '예상 상회 (상방 서프라이즈)'
    if (surprise <= -0.2) return '예상 하회 (하방 서프라이즈)'
    return '예상 부합'
  }

  // R2 모멘텀 (최근 3개월 MoM)
  if (recentMoMs.length >= 3) {
    const [m0, m1, m2] = recentMoMs
    if (m0 > 0 && m1 > 0 && m2 > 0) return '가속 지속'
    if (m0 < 0 && m1 < 0 && m2 < 0) return '둔화 지속'
  }

  // R3 방향전환
  if (currentYoy > prevYoy) return '전년비 재가속'
  if (currentYoy < prevYoy) return '전년비 둔화'

  // R4 레벨 (12개월 윈도우)
  if (last12Yoys.length > 0) {
    const max = Math.max(...last12Yoys)
    const min = Math.min(...last12Yoys)
    if (currentYoy >= max) return '12개월 내 최고'
    if (currentYoy <= min) return '12개월 내 최저'
  }

  // R5 헤드라인 vs 코어
  if (headlineYoy != null && coreYoy != null) {
    if (headlineYoy < prevYoy && coreYoy > prevYoy) return '근원 물가 압력 잔존'
  }

  return null
}

// ─────────────────────────────────────────────
// 추세 태그 분류 (시리즈 탐색 인사이트)
// ─────────────────────────────────────────────
//
// 기준: YoY 중심.
//  - 방향(상승/하락/횡보) = 최신 YoY 부호
//  - 가속도(ΔYoY) = yoy - yoy3m → 가속/둔화/지속 판정
//  - 보조: 추세반전(YoY 0선 교차·MoM 모멘텀 반전), 10년 최고/최저
//
// 임계값 (튜닝 가능)
export const TREND_DIR_EPS = 0.1    // |YoY| < 0.1 → 방향 없음(횡보)
export const TREND_ACCEL_EPS = 0.2  // |ΔYoY(3m)| < 0.2 → 가속/둔화 아님(지속)
export const TREND_LEVEL_EPS = 0.05 // 10년 최고/최저 근접 허용 오차

/**
 * 시리즈 추세 지표 → 특징 태그 분류 (순수 함수).
 * yoy가 없으면 분류 불가 → state=null, tags=[].
 */
export function classifyTrend(m: TrendMetrics): TrendResult {
  const { yoy, yoy3m, yoy6m, mom, mom1m, mom2m, yoyMin10y, yoyMax10y } = m

  // 데이터 부족
  if (yoy == null) {
    return { state: null, tags: [], deltaYoy: null }
  }

  // 가속도 (3개월 전 YoY가 없으면 '지속'으로 폴백)
  const deltaYoy = yoy3m != null ? yoy - yoy3m : null

  // 1. 주 상태 (방향 × 가속/둔화/지속)
  let state: SeriesTag
  if (yoy > TREND_DIR_EPS) {
    // 상승: YoY가 더 커지면 가속, 작아지면 둔화
    if (deltaYoy != null && deltaYoy > TREND_ACCEL_EPS) state = '상승가속'
    else if (deltaYoy != null && deltaYoy < -TREND_ACCEL_EPS) state = '상승둔화'
    else state = '상승지속'
  } else if (yoy < -TREND_DIR_EPS) {
    // 하락: YoY가 더 음수면 가속, 0쪽으로 회복하면 둔화
    if (deltaYoy != null && deltaYoy < -TREND_ACCEL_EPS) state = '하락가속'
    else if (deltaYoy != null && deltaYoy > TREND_ACCEL_EPS) state = '하락둔화'
    else state = '하락지속'
  } else {
    state = '횡보'
  }

  const tags: SeriesTag[] = [state]

  // 2. 추세반전 — YoY 0선 교차(6개월) 또는 MoM 3개월 모멘텀 반전
  const yoyCross = yoy6m != null && yoy * yoy6m < 0
  const momFlip =
    mom != null && mom1m != null && mom2m != null &&
    ((mom > 0 && mom1m < 0 && mom2m < 0) || (mom < 0 && mom1m > 0 && mom2m > 0))
  if (yoyCross || momFlip) tags.push('추세반전')

  // 3. 10년 레벨 — 최고/최저 근접 (범위 폭이 의미있을 때만)
  const hasRange =
    yoyMin10y != null && yoyMax10y != null && yoyMax10y - yoyMin10y > 0.5
  if (hasRange && yoy >= yoyMax10y! - TREND_LEVEL_EPS) tags.push('10년최고')
  else if (hasRange && yoy <= yoyMin10y! + TREND_LEVEL_EPS) tags.push('10년최저')

  return { state, tags, deltaYoy }
}

/**
 * 관측값 배열에서 특정 월의 MoM·YoY를 일괄 계산.
 * observations는 date 오름차순 정렬 가정.
 */
export function enrichObservations(
  observations: Observation[]
): Array<Observation & { mom: number | null; yoy: number | null }> {
  return observations.map((obs, i) => {
    if (obs.value == null) return { ...obs, mom: null, yoy: null }

    const prev = observations[i - 1]
    const prevYear = observations[i - 12]

    const mom =
      prev?.value != null ? calcMoM(obs.value, prev.value) : null
    const yoy =
      prevYear?.value != null ? calcYoY(obs.value, prevYear.value) : null

    return { ...obs, mom, yoy }
  })
}
