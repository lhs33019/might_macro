// FRED API 클라이언트 — 수집 전용 (lib/fred/ 와 scripts/ 에서만 호출)
// 페이지·Route Handler에서 직접 호출 금지

const FRED_BASE = 'https://api.stlouisfed.org/fred'

function apiKey(): string {
  const key = process.env.FRED_API_KEY
  if (!key) throw new Error('FRED_API_KEY 환경변수가 설정되지 않았습니다.')
  return key
}

export interface FredObservation {
  date: string
  value: string // FRED는 문자열 반환. "." = 결측
}

export interface FredSeriesMeta {
  id: string
  title: string
  units: string
  frequency: string
  seasonal_adjustment: string
  last_updated: string
}

export async function fetchSeriesMeta(seriesId: string): Promise<FredSeriesMeta> {
  const url = `${FRED_BASE}/series?series_id=${seriesId}&api_key=${apiKey()}&file_type=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`FRED series 조회 실패: ${seriesId} (${res.status})`)
  const data = await res.json()
  return data.seriess[0] as FredSeriesMeta
}

export async function fetchObservations(
  seriesId: string,
  observationStart?: string,
): Promise<FredObservation[]> {
  let url =
    `${FRED_BASE}/series/observations` +
    `?series_id=${seriesId}&api_key=${apiKey()}&file_type=json`
  if (observationStart) url += `&observation_start=${observationStart}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`FRED observations 조회 실패: ${seriesId} (${res.status})`)
  const data = await res.json()
  return data.observations as FredObservation[]
}

export interface FredCategory {
  id: number
  name: string
  parent_id: number
}

/**
 * FRED /category/children — 특정 카테고리의 직속 하위 카테고리 목록.
 * 재귀 트리 탐색의 한 단계로 사용한다.
 */
export async function fetchCategoryChildren(
  categoryId: number,
): Promise<FredCategory[]> {
  const url =
    `${FRED_BASE}/category/children` +
    `?category_id=${categoryId}` +
    `&api_key=${apiKey()}&file_type=json`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`FRED category/children 실패: category_id=${categoryId} (${res.status})`)
  const data = await res.json()
  return (data.categories ?? []) as FredCategory[]
}

/**
 * FRED /category/series — 특정 카테고리의 Monthly 시리즈 목록 수집
 */
export async function fetchCategorySeriesIds(
  categoryId: number,
  frequency = 'Monthly',
): Promise<FredSeriesMeta[]> {
  const url =
    `${FRED_BASE}/category/series` +
    `?category_id=${categoryId}` +
    `&filter_variable=frequency&filter_value=${encodeURIComponent(frequency)}` +
    `&limit=1000` +
    `&api_key=${apiKey()}&file_type=json`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`FRED category/series 실패: category_id=${categoryId} (${res.status})`)
  const data = await res.json()
  return (data.seriess ?? []) as FredSeriesMeta[]
}
