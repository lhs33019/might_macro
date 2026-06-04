/**
 * lib/queries/series.ts — Supabase 쿼리 + 집계 로직
 *
 * Server Component · Route Handler 양쪽에서 import해 사용한다.
 * cookies() 의존 없음 — service role 키로 직접 연결.
 */

import { createClient } from '@supabase/supabase-js'
import { enrichObservations } from '@/lib/analytics'
import type {
  SeriesWithStats,
  TopMover,
  TopMoversResponse,
  SeriesFullListResponse,
  ObservationItem,
  ObservationListResponse,
} from '@/lib/types'

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

// ─── fetchAllSeriesWithStats ──────────────────────────────────────────────────

/**
 * 전체 시리즈 목록 + 최근 MoM·YoY + TopMovers를 한 번에 반환.
 * 1. series 전체 조회
 * 2. 최근 14개월 observation 한 번에 조회 (N+1 없음)
 * 3. 서버에서 MoM·YoY 계산
 * 4. TopMovers(상위5·하위5) 도출
 */
export async function fetchAllSeriesWithStats(): Promise<SeriesFullListResponse> {
  const db = getSupabase()

  // 1. 전체 시리즈 메타
  const { data: seriesList, error: seriesErr } = await db
    .from('series')
    .select('series_id, title, units, frequency, seasonal_adj, category, last_updated')
    .order('series_id', { ascending: true })

  if (seriesErr) throw new Error(`series 조회 실패: ${seriesErr.message}`)
  if (!seriesList || seriesList.length === 0) {
    return {
      data: [],
      movers: { momTop: [], momBottom: [], yoyTop: [], yoyBottom: [], refDate: null },
      total: 0,
      computedAt: new Date().toISOString(),
    }
  }

  // 2. 최근 14개월 observation 전체 (한 번의 쿼리)
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 14)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const { data: obsRaw, error: obsErr } = await db
    .from('observation')
    .select('series_id, date, value')
    .gte('date', cutoffStr)
    .order('series_id', { ascending: true })
    .order('date', { ascending: true })

  if (obsErr) throw new Error(`observation 조회 실패: ${obsErr.message}`)

  // 3. series_id별 그룹핑 → enrichObservations
  type RawObs = { series_id: string; date: string; value: number | null }
  const obsMap = new Map<string, RawObs[]>()
  for (const o of (obsRaw ?? []) as RawObs[]) {
    const arr = obsMap.get(o.series_id) ?? []
    arr.push(o)
    obsMap.set(o.series_id, arr)
  }

  // 4. 각 시리즈의 stats 계산
  const statsMap = new Map<string, { latestDate: string | null; latestValue: number | null; mom: number | null; yoy: number | null }>()

  for (const [sid, obs] of obsMap.entries()) {
    const enriched = enrichObservations(obs)
    const last = [...enriched].reverse().find((e) => e.value != null)
    statsMap.set(sid, {
      latestDate:  last?.date ?? null,
      latestValue: last?.value ?? null,
      mom:         last?.mom ?? null,
      yoy:         last?.yoy ?? null,
    })
  }

  // 5. SeriesWithStats[] 조립
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
    }
  })

  // 6. TopMovers 계산 (null 제외 후 정렬)
  const withMom = data.filter((d) => d.mom != null) as (SeriesWithStats & { mom: number })[]
  const withYoy = data.filter((d) => d.yoy != null) as (SeriesWithStats & { yoy: number })[]

  function toMover(d: SeriesWithStats, value: number): TopMover {
    return { seriesId: d.seriesId, title: d.title, category: d.category, value, direction: dirOf(value) }
  }

  const sortDesc = (a: number, b: number) => b - a
  const sortAsc  = (a: number, b: number) => a - b

  const movers: TopMoversResponse = {
    momTop:    [...withMom].sort((a, b) => sortDesc(a.mom, b.mom)).slice(0, 5).map((d) => toMover(d, d.mom)),
    momBottom: [...withMom].sort((a, b) => sortAsc(a.mom, b.mom)).slice(0, 5).map((d) => toMover(d, d.mom)),
    yoyTop:    [...withYoy].sort((a, b) => sortDesc(a.yoy, b.yoy)).slice(0, 5).map((d) => toMover(d, d.yoy)),
    yoyBottom: [...withYoy].sort((a, b) => sortAsc(a.yoy, b.yoy)).slice(0, 5).map((d) => toMover(d, d.yoy)),
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

  // 전체 관측값 (오름차순)
  const { data: obsRaw, error: obsErr } = await db
    .from('observation')
    .select('series_id, date, value')
    .eq('series_id', seriesId)
    .order('date', { ascending: true })

  if (obsErr) throw new Error(`observation 조회 실패: ${obsErr.message}`)

  const obs = (obsRaw ?? []) as Array<{ series_id: string; date: string; value: number | null }>
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
