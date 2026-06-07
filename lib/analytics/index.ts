// 분석 지표 순수 함수 — 부수효과 없음, 단위 테스트 동반 필수
// 공식 출처: CLAUDE.md §8

import type { Observation } from '@/lib/supabase/types'
import type { SeriesTag, TrendMetrics, TrendResult, ContributionItem } from '@/lib/types'

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
 * Annualized N개월 (연율화, SAAR, %)
 *   = ((value_t / value_{t-N})^(12/N) - 1) * 100
 * 최근 N개월 모멘텀을 연율로 환산. SA 계열에서 의미가 명확(NSA는 계절성 주의).
 */
export function calcAnnualized(latest: number, prevN: number, months: number): number {
  return (Math.pow(latest / prevN, 12 / months) - 1) * 100
}

/** Annualized 3M (3M SAAR, %) — calcAnnualized(months=3)의 별칭. 대시보드 주지표. */
export function calcAnnualized3M(latest: number, prev3m: number): number {
  return calcAnnualized(latest, prev3m, 3)
}

/**
 * 베이스효과 캐리오버 (%p) — "다음 달 MoM=0이면 다음 YoY가 어디로 갈지".
 *   = (value_t / value_{t-11} - 1) * 100
 * 다음 달엔 12개월 전(value_{t-11}) 값이 분모로 들어오므로, 이번 값이 그대로 유지될 때의
 * YoY를 미리 본다. 현재 YoY와의 차이가 곧 "베이스(롤오프) 효과".
 */
export function calcCarryover(latest: number, value11mAgo: number): number {
  return (latest / value11mAgo - 1) * 100
}

/** PPI−CPI 마진 갭 (%p) = 생산자물가 YoY − 소비자물가 YoY. 양수=투입가가 산출가 추월(마진 압박). */
export function calcMarginGap(ppiYoy: number, cpiYoy: number): number {
  return ppiYoy - cpiYoy
}

/**
 * 인플레이션 폭(diffusion) — 값 배열 중 (eps 초과) 상승 비중.
 * null은 분모에서 제외. {up, total, pct}. total=0이면 pct=null.
 */
export function calcBreadth(
  values: readonly (number | null)[],
  eps = 0,
): { up: number; total: number; pct: number | null } {
  let up = 0
  let total = 0
  for (const v of values) {
    if (v == null) continue
    total++
    if (v > eps) up++
  }
  return { up, total, pct: total === 0 ? null : (up / total) * 100 }
}

/**
 * 부문 기여도 분해 (%p) = 상대중요도 × 부문 MoM
 * 헤드라인(예: Final Demand) MoM을 구성 부문의 기여로 나눈다.
 * mom이 없는(null) 부문은 제외한다. (순수 함수)
 */
export interface ContributionInput {
  key: string
  label: string
  weight: number          // 상대중요도 (0~1)
  mom: number | null
}
export function calcContribution(inputs: ContributionInput[]): ContributionItem[] {
  return inputs
    .filter((i): i is ContributionInput & { mom: number } => i.mom != null)
    .map((i) => ({ key: i.key, label: i.label, value: i.weight * i.mom }))
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
