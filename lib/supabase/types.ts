export type SeasonalAdj = 'SA' | 'NSA'

export type Category =
  | 'headline'
  | 'core'
  | 'energy'
  | 'food'
  | 'service'
  | string // FRED 카테고리 체계 그대로 사용 — 동적 확장 허용

export interface Series {
  series_id: string
  title: string
  units: string
  frequency: string
  seasonal_adj: SeasonalAdj
  category: Category
  last_updated: string
}

export interface Observation {
  series_id: string
  date: string        // ISO 8601, 해당 월 1일 (예: "2024-01-01")
  value: number | null // FRED "." 결측 → null
}

export interface Consensus {
  series_id: string
  date: string
  consensus_yoy: number
  source: string
  note: string | null
}
