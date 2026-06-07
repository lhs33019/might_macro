/**
 * lib/queries/dashboard.ts — 메인 대시보드용 Supabase 쿼리
 *
 * 8개 헤드라인 KPI(Annualized 3M 중심) + 부문 랭킹 + 히트맵 + AI 한줄평을
 * 한 번에 사전계산해 반환한다. Server Component·Route Handler에서 사용.
 * 추세 라인 차트는 기존 /api/series/{id}/observations 를 재사용하므로 여기 포함하지 않는다.
 */

import { createClient } from '@supabase/supabase-js'
import {
  enrichObservations, calcSurprise, calcAnnualized, calcCarryover, calcMarginGap,
} from '@/lib/analytics'
import { HEADLINE_SERIES, HEADLINE_IDS } from '@/lib/config/headline'
import { PCE_PPI_SERIES, PCE_PPI_IDS } from '@/lib/config/pce-ppi'
import { MARGIN_PAIRS } from '@/lib/config/macro'
import type {
  DashboardResponse,
  HeadlineKpi,
  DashboardHeatRow,
  DashboardInsight,
  NextRelease,
  InflationBreadth,
  PcePipeline,
  PcePipelineItem,
  MarginSpread,
  MarginSpreadItem,
  MomentumRow,
  ReleaseBriefing,
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

type Enriched = { date: string; value: number | null; mom: number | null; yoy: number | null }

/** 시리즈 1개의 모멘텀 지표 묶음 (관측값에서 직접 계산 — MV 비의존) */
interface MetricBundle {
  seriesId: string
  latestDate: string | null
  latestValue: number | null
  mom: number | null
  yoy: number | null
  ann1m: number | null
  ann3m: number | null
  ann6m: number | null
  carryover: number | null
  enriched: Enriched[]   // 오름차순 — 히트맵 재사용
}

/** asc 배열에서 months개월 전 대비 연율 (값·양수 가드) */
function annAt(arr: Enriched[], months: number): number | null {
  const n = arr.length
  const latest = arr[n - 1]?.value
  const prev = arr[n - 1 - months]?.value
  if (latest == null || prev == null || prev <= 0) return null
  return calcAnnualized(latest, prev, months)
}

/**
 * 주어진 시리즈들의 최근 관측값을 한 번에 받아 모멘텀 지표 묶음을 계산한다.
 * series_trend_mv에 의존하지 않으므로 MV 갱신 실패와 무관하게 항상 최신.
 */
async function loadMetricsFor(
  db: ReturnType<typeof getSupabase>,
  ids: readonly string[],
  months = 14,
): Promise<Map<string, MetricBundle>> {
  const limit = months + 1
  const entries = await Promise.all(
    ids.map(async (id): Promise<[string, MetricBundle]> => {
      const { data: obs, error } = await db
        .from('observation')
        .select('series_id, date, value')
        .eq('series_id', id)
        .order('date', { ascending: false })
        .limit(limit)
      if (error) throw new Error(`observation(${id}) 조회 실패: ${error.message}`)

      const asc = (obs ?? [])
        .map((o) => ({ series_id: o.series_id, date: o.date, value: o.value == null ? null : Number(o.value) }))
        .reverse()
      const enriched = enrichObservations(asc) as Enriched[]
      const n = enriched.length
      const last = enriched[n - 1]
      const v11 = enriched[n - 12]?.value  // 다음 달 분모(t-11)
      const carryover =
        last?.value != null && v11 != null && v11 > 0 ? calcCarryover(last.value, v11) : null

      return [id, {
        seriesId: id,
        latestDate: last?.date ?? null,
        latestValue: last?.value ?? null,
        mom: last?.mom ?? null,
        yoy: last?.yoy ?? null,
        ann1m: annAt(enriched, 1),
        ann3m: annAt(enriched, 3),
        ann6m: annAt(enriched, 6),
        carryover,
        enriched,
      }]
    }),
  )
  return new Map(entries)
}

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

  // 2.5 시장 컨센서스 — FRED 경로와 분리된 수동 입력(consensus 테이블).
  //     기준월(해당 시리즈 최신 관측월)과 date가 정확히 일치할 때만 서프라이즈를 계산한다.
  //     (과거 컨센서스를 새 발표월에 잘못 매칭하지 않도록 — 정확성 §8)
  const { data: consRaw, error: consErr } = await db
    .from('consensus')
    .select('series_id, date, consensus_yoy, source')
    .in('series_id', HEADLINE_IDS)
  if (consErr) throw new Error(`consensus 조회 실패: ${consErr.message}`)
  const consMap = new Map<string, { date: string; yoy: number | null; source: string }[]>()
  for (const c of consRaw ?? []) {
    const list = consMap.get(c.series_id) ?? []
    list.push({ date: c.date, yoy: toNum(c.consensus_yoy), source: c.source })
    consMap.set(c.series_id, list)
  }

  // 3. HEADLINE_SERIES 순서대로 KPI 조립
  const headline: HeadlineKpi[] = HEADLINE_SERIES.map((def) => {
    const t = trendMap.get(def.id)
    const m = metaMap.get(def.id)
    const yoy = toNum(t?.yoy ?? null)
    const ann3m = toNum(t?.ann3m ?? null)
    const latestDate = t?.latest_date ?? null

    // 컨센서스 — 기준월(latestDate)과 date가 일치하는 행만 사용
    const cons = (consMap.get(def.id) ?? []).find(
      (c) => latestDate != null && c.date.slice(0, 10) === latestDate.slice(0, 10),
    )
    const consensusYoy = cons?.yoy ?? null
    const surprise =
      yoy != null && consensusYoy != null ? calcSurprise(yoy, consensusYoy) : null

    return {
      seriesId:    def.id,
      label:       def.label,
      title:       m?.title ?? def.id,
      units:       m?.units ?? '',
      seasonalAdj: (m?.seasonal_adj as SeriesWithStats['seasonalAdj']) ?? def.basis,
      latestDate,
      latestValue: toNum(t?.latest_value ?? null),
      mom:         toNum(t?.mom ?? null),
      yoy,
      ann3m,
      accel3m:     toNum(t?.accel3m ?? null),
      // ΔYoY는 대시보드에선 미사용 → null (필요 시 series 쿼리에서 보강)
      deltaYoy:    null,
      tags:        [],
      consensusYoy,
      surprise,
      consensusSource: cons?.source ?? null,
    }
  })

  // 4. 부문 랭킹 — ann3m 내림차순 (null 뒤로)
  const sectorAnn3m = [...headline].sort((a, b) => {
    if (a.ann3m == null && b.ann3m == null) return 0
    if (a.ann3m == null) return 1
    if (b.ann3m == null) return -1
    return b.ann3m - a.ann3m
  })

  // 5. 포커스 패널 메트릭 — 헤드라인/PCE/마진 시리즈를 관측값에서 직접 계산(MV 비의존)
  const marginIds = Array.from(new Set(MARGIN_PAIRS.flatMap((p) => [p.ppiId, p.cpiId])))
  const [headlineMetrics, pceMetrics, marginMetrics] = await Promise.all([
    loadMetricsFor(db, HEADLINE_IDS, 14),
    loadMetricsFor(db, PCE_PPI_IDS, 14),
    loadMetricsFor(db, marginIds, 14),
  ])

  // 5a. 히트맵 — 헤드라인 enriched(오름차순)에서 최근 N개월 MoM
  const heatmap: DashboardHeatRow[] = HEADLINE_SERIES.map((def) => {
    const e = headlineMetrics.get(def.id)?.enriched ?? []
    const cells = e.slice(-HEAT_MONTHS).map((c) => ({ date: c.date, mom: c.mom }))
    return { seriesId: def.id, label: def.label, cells }
  })

  // 5b. 모멘텀 래더 — 헤드라인별 1M/3M/6M 연율 + YoY + 캐리오버
  const momentum: MomentumRow[] = HEADLINE_SERIES.map((def) => {
    const b = headlineMetrics.get(def.id)
    return {
      seriesId: def.id, label: def.label,
      ann1m: b?.ann1m ?? null, ann3m: b?.ann3m ?? null, ann6m: b?.ann6m ?? null,
      yoy: b?.yoy ?? null, carryover: b?.carryover ?? null,
    }
  })

  // 5c. PCE 파이프라인 — 코어 PCE 반영 PPI 라인 + 방향 종합(가중합 아님)
  const pceItems: PcePipelineItem[] = PCE_PPI_SERIES.map((def) => {
    const b = pceMetrics.get(def.id)
    return { seriesId: def.id, label: def.label, group: def.group, mom: b?.mom ?? null, ann3m: b?.ann3m ?? null, yoy: b?.yoy ?? null }
  })
  const pceUp = pceItems.filter((i) => i.ann3m != null && i.ann3m > 0).length
  const pceValid = pceItems.filter((i) => i.ann3m != null).length
  const pceRead: PcePipeline['read'] =
    pceValid === 0 ? null : pceUp * 2 > pceValid ? 'firming' : pceUp * 2 < pceValid ? 'softening' : 'mixed'
  const pcePipeline: PcePipeline = { items: pceItems, read: pceRead }

  // 5d. PPI−CPI 마진 스프레드 (계열 일치 — 양쪽 SA)
  const marginItems: MarginSpreadItem[] = MARGIN_PAIRS.map((p) => {
    const ppiYoy = marginMetrics.get(p.ppiId)?.yoy ?? null
    const cpiYoy = marginMetrics.get(p.cpiId)?.yoy ?? null
    const gap = ppiYoy != null && cpiYoy != null ? calcMarginGap(ppiYoy, cpiYoy) : null
    return { key: p.key, label: p.label, ppiYoy, cpiYoy, gap }
  })
  const marginSpread: MarginSpread = { pairs: marginItems }

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

  // 7. 다음 발표 일정 — release_schedule(PPI=46). 적재 시점 저장값을 읽어 D-day 계산.
  const { data: relRow, error: relErr } = await db
    .from('release_schedule')
    .select('next_date')
    .eq('release_id', 46)
    .maybeSingle()
  if (relErr) throw new Error(`release_schedule 조회 실패: ${relErr.message}`)

  let nextRelease: NextRelease | null = null
  if (relRow?.next_date) {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const next = new Date(`${relRow.next_date}T00:00:00Z`)
    const dDay = Math.round((next.getTime() - today.getTime()) / 86_400_000)
    // 과거 일정(음수)은 미갱신 상태이므로 표기하지 않는다.
    if (dDay >= 0) nextRelease = { date: relRow.next_date, dDay }
  }

  // 8. 인플레이션 폭(diffusion) — series_trend_mv 집계(count head). MV stale 허용(best-effort).
  const [momUpC, momTotC, yoyUpC, yoyTotC] = await Promise.all([
    db.from('series_trend_mv').select('series_id', { count: 'exact', head: true }).gt('mom', 0),
    db.from('series_trend_mv').select('series_id', { count: 'exact', head: true }).not('mom', 'is', null),
    db.from('series_trend_mv').select('series_id', { count: 'exact', head: true }).gt('yoy', 0),
    db.from('series_trend_mv').select('series_id', { count: 'exact', head: true }).not('yoy', 'is', null),
  ])
  const momUp = momUpC.count ?? 0, momTot = momTotC.count ?? 0
  const yoyUp = yoyUpC.count ?? 0, yoyTot = yoyTotC.count ?? 0
  const breadth: InflationBreadth | null = momTot > 0 || yoyTot > 0
    ? {
        momUpPct: momTot > 0 ? (momUp / momTot) * 100 : null,
        yoyUpPct: yoyTot > 0 ? (yoyUp / yoyTot) * 100 : null,
        total: momTot,
      }
    : null

  // 9. 발표일 브리핑 — 신규 지표를 결정적으로 종합
  const SURPRISE_EPS = 0.2
  const surpriseVals = headline.map((h) => h.surprise).filter((s): s is number => s != null)
  const beats = surpriseVals.filter((s) => s >= SURPRISE_EPS).length
  const misses = surpriseVals.filter((s) => s <= -SURPRISE_EPS).length
  const topAccel = [...headline]
    .filter((h) => h.accel3m != null)
    .sort((a, b) => b.accel3m! - a.accel3m!)[0] ?? null
  const headlineGap = marginItems.find((m) => m.key === 'headline')?.gap ?? null
  const marginRead: ReleaseBriefing['marginRead'] =
    headlineGap == null ? null : headlineGap > 0.3 ? 'squeeze' : headlineGap < -0.3 ? 'relief' : 'neutral'
  const briefing: ReleaseBriefing = {
    surpriseBeats: beats,
    surpriseMisses: misses,
    surpriseTotal: surpriseVals.length,
    topAccelLabel: topAccel?.label ?? null,
    topAccelValue: topAccel?.accel3m ?? null,
    breadthPct: breadth?.momUpPct ?? null,
    pceRead,
    marginRead,
  }

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
    nextRelease,
    breadth,
    pcePipeline,
    marginSpread,
    momentum,
    briefing,
    refDate,
    computedAt: new Date().toISOString(),
  }
}
