// 분석 지표 순수 함수 — 부수효과 없음, 단위 테스트 동반 필수
// 공식 출처: CLAUDE.md §8

import type { Observation } from '@/lib/supabase/types'

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
