/**
 * lib/queries/series.ts — Supabase 쿼리 + 집계 로직
 *
 * Server Component · Route Handler 양쪽에서 import해 사용한다.
 * cookies() 의존 없음 — service role 키로 직접 연결.
 */

import { createClient } from '@supabase/supabase-js'
import { enrichObservations, classifyTrend, isHistoricalExtreme } from '@/lib/analytics'
import type {
  SeriesWithStats,
  TopMover,
  TopMoversResponse,
  SeriesFullListResponse,
  ObservationItem,
  ObservationListResponse,
  TrendMetrics,
} from '@/lib/types'

/** series_trend_mv 매터리얼라이즈드 뷰 행 */
type TrendStatsRow = {
  series_id: string
  latest_date: string | null
  latest_value: number | string | null
  mom: number | string | null
  yoy: number | string | null
  yoy_3m: number | string | null
  yoy_6m: number | string | null
  mom_1m: number | string | null
  mom_2m: number | string | null
  yoy_min_10y: number | string | null
  yoy_max_10y: number | string | null
  ann3m: number | string | null
  accel3m: number | string | null
  yoy_pctile_10y: number | string | null
  mom_pctile_10y: number | string | null
  yoy_z10y: number | string | null
}

// 데이터 프론티어 대비 이 개월 수 이상 뒤처지면 "끊긴 시리즈"로 보고 태그 제외
const ACTIVE_WINDOW_MONTHS = 3

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase 환경변수 누락')
  return createClient(url, key, { auth: { persistSession: false } })
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function dirOf(v: number | null): 'up' | 'down' | 'flat' {
  if (v == null) return 'flat'
  return v > 0.02 ? 'up' : v < -0.02 ? 'down' : 'flat'
}

/**
 * PostgREST 기본 1000행 상한을 회피해 전체 행을 가져온다.
 * range(from, to)로 1000행씩 끊어 받고, 1000 미만이 오면 종료.
 * 안정적 페이지네이션을 위해 page 빌더에 반드시 order를 포함해야 한다.
 */
async function fetchAllPaged<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const SIZE = 1000
  const out: T[] = []
  for (let from = 0; ; from += SIZE) {
    const { data, error } = await page(from, from + SIZE - 1)
    if (error) throw new Error(`${label} 조회 실패: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < SIZE) break
  }
  return out
}

// ─── fetchAllSeriesWithStats ──────────────────────────────────────────────────

/**
 * 전체 시리즈 목록 + 최신 MoM·YoY + 추세 태그 + TopMovers를 한 번에 반환.
 * 1. series 전체 조회 (페이지네이션 — 1000행 상한 회피)
 * 2. series_trend_mv(매터리얼라이즈드 뷰)로 시리즈별 추세 지표 일괄 조회
 *    (각 시리즈의 실제 최신 시점 기준 10년 윈도우 — 데이터 지연·과거 시리즈 모두 정확)
 * 3. classifyTrend로 태그 산출 후 SeriesWithStats[] 조립
 *    (끊긴 시리즈는 태그 제외 — ACTIVE_WINDOW_MONTHS)
 * 4. TopMovers(상위5·하위5) 도출
 */
export async function fetchAllSeriesWithStats(): Promise<SeriesFullListResponse> {
  const db = getSupabase()

  // 1. 전체 시리즈 메타 (1000행 상한 회피 — 페이지네이션으로 전부)
  const seriesList = await fetchAllPaged(
    (from, to) => db
      .from('series')
      .select('series_id, title, units, frequency, seasonal_adj, category, last_updated')
      .order('series_id', { ascending: true })
      .range(from, to),
    'series',
  )

  if (seriesList.length === 0) {
    return {
      data: [],
      movers: { momTop: [], momBottom: [], yoyTop: [], yoyBottom: [], pctileTop: [], pctileBottom: [], refDate: null },
      total: 0,
      computedAt: new Date().toISOString(),
    }
  }

  // 2. 시리즈별 추세 지표 (매터리얼라이즈드 뷰 — 미리 계산됨, 1000행 상한 회피)
  const statsRaw = await fetchAllPaged<TrendStatsRow>(
    (from, to) => db
      .from('series_trend_mv')
      .select('series_id, latest_date, latest_value, mom, yoy, yoy_3m, yoy_6m, mom_1m, mom_2m, yoy_min_10y, yoy_max_10y, ann3m, accel3m, yoy_pctile_10y, mom_pctile_10y, yoy_z10y')
      .order('series_id', { ascending: true })
      .range(from, to),
    'series_trend_mv',
  )

  // 3. series_id → 지표·태그 매핑 (numeric은 문자열로 올 수 있어 숫자로 강제)
  const toNum = (v: number | string | null): number | null =>
    v == null ? null : Number(v)

  type SeriesStat = {
    latestDate: string | null
    latestValue: number | null
    mom: number | null
    yoy: number | null
    ann3m: number | null
    accel3m: number | null
    tags: SeriesWithStats['tags']
    trendState: SeriesWithStats['trendState']
    deltaYoy: number | null
    yoyMin10y: number | null
    yoyMax10y: number | null
    yoyPctile10y: number | null
    momPctile10y: number | null
    yoyZ10y: number | null
  }
  const rows = statsRaw

  // 끊긴 시리즈 판별 — 전체 데이터 프론티어(가장 최신 관측월)에서
  // ACTIVE_WINDOW_MONTHS개월 이상 뒤처진 시리즈는 갱신이 멈춘 것으로 보고 태그 제외.
  const maxLatest = rows.reduce<string | null>(
    (mx, r) => (r.latest_date && (mx == null || r.latest_date > mx) ? r.latest_date : mx),
    null,
  )
  let cutoff: string | null = null
  if (maxLatest) {
    const d = new Date(maxLatest + 'T00:00:00Z')
    d.setUTCMonth(d.getUTCMonth() - ACTIVE_WINDOW_MONTHS)
    cutoff = d.toISOString().slice(0, 10)
  }

  const statsMap = new Map<string, SeriesStat>()
  for (const r of rows) {
    const metrics: TrendMetrics = {
      yoy:       toNum(r.yoy),
      yoy3m:     toNum(r.yoy_3m),
      yoy6m:     toNum(r.yoy_6m),
      mom:       toNum(r.mom),
      mom1m:     toNum(r.mom_1m),
      mom2m:     toNum(r.mom_2m),
      yoyMin10y: toNum(r.yoy_min_10y),
      yoyMax10y: toNum(r.yoy_max_10y),
    }
    // 활성 시리즈만 태그 부여 (끊긴 시리즈는 빈 태그)
    const isActive = cutoff != null && r.latest_date != null && r.latest_date >= cutoff
    const trend = isActive
      ? classifyTrend(metrics)
      : { state: null, tags: [] as SeriesWithStats['tags'], deltaYoy: null }
    // 역사적극단 — 백분위(SQL 사전계산) 기준 보조 태그. classifyTrend 계약 밖이라 조립부에서 append.
    const yoyPctile10y = toNum(r.yoy_pctile_10y)
    const tags = isActive && isHistoricalExtreme(yoyPctile10y)
      ? [...trend.tags, '역사적극단' as const]
      : trend.tags
    statsMap.set(r.series_id, {
      latestDate:  r.latest_date,
      latestValue: toNum(r.latest_value),
      mom:         metrics.mom,
      yoy:         metrics.yoy,
      ann3m:       toNum(r.ann3m),
      accel3m:     toNum(r.accel3m),
      tags,
      trendState:  trend.state,
      deltaYoy:    trend.deltaYoy,
      yoyMin10y:   metrics.yoyMin10y,
      yoyMax10y:   metrics.yoyMax10y,
      yoyPctile10y,
      momPctile10y: toNum(r.mom_pctile_10y),
      yoyZ10y:      toNum(r.yoy_z10y),
    })
  }

  // 4. SeriesWithStats[] 조립
  const data: SeriesWithStats[] = seriesList.map((s) => {
    const stats = statsMap.get(s.series_id)
    return {
      seriesId:    s.series_id,
      title:       s.title,
      units:       s.units,
      seasonalAdj: s.seasonal_adj as 'SA' | 'NSA',
      category:    s.category,
      lastUpdated: s.last_updated ?? '',
      latestDate:  stats?.latestDate ?? null,
      latestValue: stats?.latestValue ?? null,
      mom:         stats?.mom ?? null,
      yoy:         stats?.yoy ?? null,
      ann3m:       stats?.ann3m ?? null,
      accel3m:     stats?.accel3m ?? null,
      tags:        stats?.tags ?? [],
      trendState:  stats?.trendState ?? null,
      deltaYoy:    stats?.deltaYoy ?? null,
      yoyMin10y:   stats?.yoyMin10y ?? null,
      yoyMax10y:   stats?.yoyMax10y ?? null,
      yoyPctile10y: stats?.yoyPctile10y ?? null,
      momPctile10y: stats?.momPctile10y ?? null,
      yoyZ10y:      stats?.yoyZ10y ?? null,
    }
  })

  // 6. TopMovers 계산 (null 제외 후 정렬)
  const withMom = data.filter((d) => d.mom != null) as (SeriesWithStats & { mom: number })[]
  const withYoy = data.filter((d) => d.yoy != null) as (SeriesWithStats & { yoy: number })[]
  // 백분위 movers — 활성 시리즈만 (끊긴 시리즈의 과거 극단이 발굴 동선을 오염시키지 않게)
  const withPctile = data.filter(
    (d) => d.yoyPctile10y != null && cutoff != null && d.latestDate != null && d.latestDate >= cutoff,
  ) as (SeriesWithStats & { yoyPctile10y: number })[]

  function toMover(d: SeriesWithStats, value: number): TopMover {
    return { seriesId: d.seriesId, title: d.title, category: d.category, value, direction: dirOf(value) }
  }
  /** 백분위 전용 — 방향은 변화율 부호가 아닌 분포 위치(P95↑/P5↓) 기준 */
  function toPctileMover(d: SeriesWithStats, value: number): TopMover {
    const direction = value >= 95 ? 'up' : value <= 5 ? 'down' : 'flat'
    return { seriesId: d.seriesId, title: d.title, category: d.category, value, direction }
  }

  const sortDesc = (a: number, b: number) => b - a
  const sortAsc  = (a: number, b: number) => a - b

  const movers: TopMoversResponse = {
    momTop:    [...withMom].sort((a, b) => sortDesc(a.mom, b.mom)).slice(0, 5).map((d) => toMover(d, d.mom)),
    momBottom: [...withMom].sort((a, b) => sortAsc(a.mom, b.mom)).slice(0, 5).map((d) => toMover(d, d.mom)),
    yoyTop:    [...withYoy].sort((a, b) => sortDesc(a.yoy, b.yoy)).slice(0, 5).map((d) => toMover(d, d.yoy)),
    yoyBottom: [...withYoy].sort((a, b) => sortAsc(a.yoy, b.yoy)).slice(0, 5).map((d) => toMover(d, d.yoy)),
    pctileTop:    [...withPctile].sort((a, b) => sortDesc(a.yoyPctile10y, b.yoyPctile10y)).slice(0, 5).map((d) => toPctileMover(d, d.yoyPctile10y)),
    pctileBottom: [...withPctile].sort((a, b) => sortAsc(a.yoyPctile10y, b.yoyPctile10y)).slice(0, 5).map((d) => toPctileMover(d, d.yoyPctile10y)),
    refDate:   withMom[0]?.latestDate ?? null,
  }

  return {
    data,
    movers,
    total: data.length,
    computedAt: new Date().toISOString(),
  }
}

// ─── fetchSeriesObservations ──────────────────────────────────────────────────

/**
 * 특정 시리즈의 전체 관측값 + MoM·YoY 반환.
 * 시리즈가 없으면 null 반환 (Route Handler에서 404 처리).
 */
export async function fetchSeriesObservations(
  seriesId: string,
): Promise<ObservationListResponse | null> {
  const db = getSupabase()

  // 시리즈 메타 확인
  const { data: meta, error: metaErr } = await db
    .from('series')
    .select('series_id, title, units, seasonal_adj')
    .eq('series_id', seriesId)
    .maybeSingle()

  if (metaErr) throw new Error(`series 조회 실패: ${metaErr.message}`)
  if (!meta) return null

  // 전체 관측값 (오름차순, 1000행 상한 회피 — 긴 시리즈는 1360개월 이상)
  const obs = await fetchAllPaged<{ series_id: string; date: string; value: number | null }>(
    (from, to) => db
      .from('observation')
      .select('series_id, date, value')
      .eq('series_id', seriesId)
      .order('date', { ascending: true })
      .range(from, to),
    'observation',
  )

  const enriched = enrichObservations(obs)

  const items: ObservationItem[] = enriched.map((e) => ({
    date:  e.date,
    value: e.value,
    mom:   e.mom,
    yoy:   e.yoy,
  }))

  return {
    seriesId: meta.series_id,
    title:    meta.title,
    units:    meta.units,
    seasonalAdj: meta.seasonal_adj as 'SA' | 'NSA',
    data: items,
    range: {
      from: items[0]?.date ?? null,
      to:   items[items.length - 1]?.date ?? null,
    },
  }
}
