/**
 * lib/config/headline.ts — 대시보드 헤드라인 시리즈 SSoT
 *
 * 메인 대시보드 KPI·부문 랭킹·히트맵·AI 한줄평이 공통으로 참조하는
 * 8개 주요 지표 정의. ingest 시드 목록으로도 사용해 항상 적재·갱신되게 한다.
 *
 * series_id는 모두 FRED 표준 Final Demand/Industry ID이며 DB 적재 확인됨.
 * basis(SA/NSA)는 화면 표기 및 Annualized 3M 계절성 주의 캡션에 사용한다.
 */

export interface HeadlineSeriesDef {
  readonly id: string
  readonly label: string          // 한국어 표시명 (KPI 카드 라벨)
  readonly basis: 'SA' | 'NSA'    // 계절조정 여부 (표기·캡션용)
}

export const HEADLINE_SERIES: readonly HeadlineSeriesDef[] = [
  { id: 'PPIACO',          label: '헤드라인 PPI',    basis: 'NSA' }, // All Commodities
  { id: 'PPIFIS',          label: '코어 PPI(FD)',    basis: 'SA'  }, // Final Demand
  { id: 'PPIFDG',          label: '최종수요 재화',   basis: 'NSA' }, // Final Demand Goods
  { id: 'PPIFDS',          label: '최종수요 서비스', basis: 'NSA' }, // Final Demand Services
  { id: 'WPSFD4121',       label: '에너지',          basis: 'SA'  }, // Finished Consumer Energy Goods
  { id: 'WPU01',           label: '식품(농산물)',    basis: 'NSA' }, // Farm Products
  { id: 'PCU484484',       label: '운송(트럭)',      basis: 'NSA' }, // Truck Transportation
  { id: 'PCU236400236400', label: '건설',            basis: 'NSA' }, // New Nonresidential Building Construction
] as const

/** 진짜 근원(식품·에너지 제외) — AI 한줄평의 헤드라인↔코어 비교용 */
export const CORE_REFERENCE_SERIES = 'PPIFES'

export const HEADLINE_IDS: readonly string[] = HEADLINE_SERIES.map((s) => s.id)
