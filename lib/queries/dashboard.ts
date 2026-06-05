/**
 * lib/queries/dashboard.ts — 메인 대시보드용 Supabase 쿼리
 *
 * 8개 헤드라인 KPI(Annualized 3M 중심) + 부문 랭킹 + 히트맵 + AI 한줄평을
 * 한 번에 사전계산해 반환한다. Server Component·Route Handler에서 사용.
 * 추세 라인 차트는 기존 /api/series/{id}/observations 를 재사용하므로 여기 포함하지 않는다.
 */

import { createClient } from '@supabase/supabase-js'
import { enrichObservations } from '@/lib/analytics'
import { HEADLINE_SERIES, HEADLINE_IDS } from '@/lib/config/headline'
import type {
  DashboardResponse,
  HeadlineKpi,
  DashboardHeatRow,
  DashboardInsight,
  SeriesWithStats,
} from '@/lib/types'

/** 히트맵에 보여줄 최근 개월 수 */
const HEAT_MONTHS = 8

type TrendRow = {
  series_id: string
  latest_date: string | null
  latest_value: number | string | null
  mom: number | string | null
  yoy: number | string | null
  ann3m: number | string | null
  accel3m: number | string | null
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase 환경변수 누락')
  return createClient(url, key, { auth: { persistSession: false } })
}

const toNum = (v: number | string | null): number | null =>
  v == null ? null : Number(v)

/**
 * 전체 헤드라인 대시보드 데이터를 조립해 반환.
 * 1. series_trend_mv 에서 8개 헤드라인 지표 일괄 조회
 * 2. series 메타(title/units/SA-NSA) 보강
 * 3. classifyTrend 태그는 series 쿼리에서 이미 계산되므로 여기선 핵심 지표만 사용
 * 4. 최근 8개월 관측값으로 히트맵 MoM 구성
 * 5. dashboard_insight 최신 1행
 */
export async function fetchDashboard(): Promise<DashboardResponse> {
  const db = getSupabase()

  // 1. 헤드라인 추세 지표 (matview)
  const { data: trendRaw, error: trendErr } = await db
    .from('series_trend_mv')
    .select('series_id, latest_date, latest_value, mom, yoy, ann3m, accel3m')
    .in('series_id', HEADLINE_IDS)

  if (trendErr) throw new Error(`series_trend_mv 조회 실패: ${trendErr.message}`)
  const trendMap = new Map<string, TrendRow>(
    (trendRaw ?? []).map((r) => [r.series_id, r as TrendRow]),
  )

  // 2. 메타(title/units/seasonal_adj) + classifyTrend 태그
  const { data: metaRaw, error: metaErr } = await db
    .from('series')
    .select('series_id, title, units, seasonal_adj')
    .in('series_id', HEADLINE_IDS)

  if (metaErr) throw new Error(`series 메타 조회 실패: ${metaErr.message}`)
  const metaMap = new Map(
    (metaRaw ?? []).map((m) => [m.series_id, m]),
  )

  // 3. HEADLINE_SERIES 순서대로 KPI 조립
  const headline: HeadlineKpi[] = HEADLINE_SERIES.map((def) => {
    const t = trendMap.get(def.id)
    const m = metaMap.get(def.id)
    const yoy = toNum(t?.yoy ?? null)
    const ann3m = toNum(t?.ann3m ?? null)
    return {
      seriesId:    def.id,
      label:       def.label,
      title:       m?.title ?? def.id,
      units:       m?.units ?? '',
      seasonalAdj: (m?.seasonal_adj as SeriesWithStats['seasonalAdj']) ?? def.basis,
      latestDate:  t?.latest_date ?? null,
      latestValue: toNum(t?.latest_value ?? null),
      mom:         toNum(t?.mom ?? null),
      yoy,
      ann3m,
      accel3m:     toNum(t?.accel3m ?? null),
      // ΔYoY는 대시보드에선 미사용 → null (필요 시 series 쿼리에서 보강)
      deltaYoy:    null,
      tags:        [],
    }
  })

  // 4. 부문 랭킹 — ann3m 내림차순 (null 뒤로)
  const sectorAnn3m = [...headline].sort((a, b) => {
    if (a.ann3m == null && b.ann3m == null) return 0
    if (a.ann3m == null) return 1
    if (b.ann3m == null) return -1
    return b.ann3m - a.ann3m
  })

  // 5. 히트맵 — 8개 시리즈의 최근 (HEAT_MONTHS+1)개월 관측값으로 MoM 계산
  const heatmap: DashboardHeatRow[] = await Promise.all(
    HEADLINE_SERIES.map(async (def): Promise<DashboardHeatRow> => {
      const { data: obs, error } = await db
        .from('observation')
        .select('series_id, date, value')
        .eq('series_id', def.id)
        .order('date', { ascending: false })
        .limit(HEAT_MONTHS + 1)
      if (error) throw new Error(`observation(${def.id}) 조회 실패: ${error.message}`)

      // 오름차순으로 되돌려 MoM 계산
      const asc = (obs ?? [])
        .map((o) => ({ ...o, value: o.value == null ? null : Number(o.value) }))
        .reverse()
      const enriched = enrichObservations(asc)
      const cells = enriched
        .slice(-HEAT_MONTHS)
        .map((e) => ({ date: e.date, mom: e.mom }))
      return { seriesId: def.id, label: def.label, cells }
    }),
  )

  // 6. AI 한줄평 — 최신 1행
  const { data: insightRow, error: insightErr } = await db
    .from('dashboard_insight')
    .select('ref_date, body, model, generated_at')
    .order('ref_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (insightErr) throw new Error(`dashboard_insight 조회 실패: ${insightErr.message}`)
  const insight: DashboardInsight | null = insightRow
    ? {
        body:        insightRow.body,
        model:       insightRow.model,
        refDate:     insightRow.ref_date,
        generatedAt: insightRow.generated_at,
      }
    : null

  // 기준월 = 헤드라인 중 가장 최신 관측월
  const refDate = headline.reduce<string | null>(
    (mx, k) => (k.latestDate && (mx == null || k.latestDate > mx) ? k.latestDate : mx),
    null,
  )

  return {
    headline,
    sectorAnn3m,
    heatmap,
    insight,
    refDate,
    computedAt: new Date().toISOString(),
  }
}
