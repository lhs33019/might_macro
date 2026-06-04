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

export async function fetchObservations(seriesId: string): Promise<FredObservation[]> {
  const url =
    `${FRED_BASE}/series/observations` +
    `?series_id=${seriesId}&api_key=${apiKey()}&file_type=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`FRED observations 조회 실패: ${seriesId} (${res.status})`)
  const data = await res.json()
  return data.observations as FredObservation[]
}

/**
 * FRED /series/search — 검색어로 시리즈 전체 목록 수집 (Monthly 필터)
 * FRED는 최대 1000건/요청이므로 offset 순회로 전체를 합산한다.
 */
export async function fetchSeriesBySearch(
  searchText: string,
  frequency = 'Monthly',
): Promise<FredSeriesMeta[]> {
  const limit = 1000
  let offset = 0
  const all: FredSeriesMeta[] = []

  while (true) {
    const url =
      `${FRED_BASE}/series/search` +
      `?search_text=${encodeURIComponent(searchText)}` +
      `&filter_variable=frequency&filter_value=${encodeURIComponent(frequency)}` +
      `&limit=${limit}&offset=${offset}` +
      `&api_key=${apiKey()}&file_type=json`

    const res = await fetch(url)
    if (!res.ok) throw new Error(`FRED series/search 실패 (${res.status})`)
    const data = await res.json()
    const seriess: FredSeriesMeta[] = data.seriess ?? []
    all.push(...seriess)

    if (seriess.length < limit) break   // 마지막 페이지
    offset += limit
    await new Promise((r) => setTimeout(r, 500))  // FRED 레이트 제한 보호
  }

  return all
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
