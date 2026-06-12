/**
 * FRED → Supabase 적재 스크립트
 * 실행: npm run ingest              (전체 발견 → 적재)
 *       npm run ingest:retry        (이전 실패분만 재시도)
 *       npm run ingest:headline     (8개 헤드라인만, AI 한줄평 재생성 — 수십 초)
 *       npm run ingest:incremental  (전체 발견 + 증분 수집 — 신규분만)
 *       npm run ingest:update       (헤드라인 8개 + 증분 — 최속 갱신)
 *
 * 플래그:
 *  --headline-only : 헤드라인 9개만 수집 (카테고리 탐색 생략)
 *  --incremental   : 각 시리즈의 DB 최신 날짜 이후만 수집 (리비전 보호: -3개월)
 *  --retry         : failed-series.json 목록만 재시도 (증분 미적용)
 *
 * --headline-only + --incremental 조합 가능: 헤드라인 9개 증분 수집.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  fetchSeriesMeta,
  fetchObservations,
  fetchCategoryChildren,
  fetchCategorySeriesIds,
  fetchReleaseDates,
  PPI_RELEASE_ID,
} from '../lib/fred/client'
import { HEADLINE_IDS, CORE_REFERENCE_SERIES } from '../lib/config/headline'
import { PCE_PPI_IDS } from '../lib/config/pce-ppi'
import { PIPELINE_IDS } from '../lib/config/pipeline'
import { CPI_IDS } from '../lib/config/macro'
import { fetchDashboard } from '../lib/queries/dashboard'
import { generateInsight, type InsightMetricInput } from '../lib/insight/generate'

// ─── 설정 ────────────────────────────────────────────────────────────────────

/**
 * FRED PPI 트리의 루트 카테고리.
 *  31 = "Producer Price Indexes (PPI)" (부모: 32455 Prices)
 * 이 노드부터 하위 카테고리를 재귀 탐색해 모든 PPI Monthly 시리즈를 발견한다.
 * (이전의 /series/search 방식은 FRED의 5,000건 페이지네이션 상한에 걸려
 *  결과가 통째로 폐기되는 문제가 있어 카테고리 재귀 방식으로 전환했다.)
 */
const PPI_ROOT_CATEGORY = 31

/** 카테고리 탐색 요청 사이 지연(ms) — FRED 레이트 제한 보호 */
const DISCOVER_DELAY_MS = 120

const FAILED_FILE = path.join(process.cwd(), 'failed-series.json')
const CHUNK_SIZE = 500   // observation upsert 청크 크기

/** 증분 수집 시 DB 최신 날짜에서 몇 개월 전부터 재수집할지 (PPI 리비전 보호) */
const INCREMENTAL_REVISION_BUFFER_MONTHS = 3

// ─── Supabase 클라이언트 ──────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase 환경변수 누락 (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
  return createClient(url, key)
}

// ─── 날짜 유틸 ────────────────────────────────────────────────────────────────

/** YYYY-MM-DD 문자열에서 months 개월 전 날짜를 YYYY-MM-DD로 반환 */
function subtractMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() - months)
  return d.toISOString().slice(0, 10)
}

// ─── 카테고리 자동 분류 ────────────────────────────────────────────────────────

function inferCategory(id: string, title: string): string {
  const t = title.toLowerCase()
  if (t.includes('food')) return 'food'
  if (t.includes('energy')) return 'energy'
  if (t.includes('ex food') || t.includes('ex. food') || t.includes('core')) return 'core'
  if (t.includes('service')) return 'service'
  if (t.includes('goods') && !t.includes('finished goods')) return 'goods'
  if ((t.includes('final demand') || id === 'PPIFIS') && !t.includes('food') && !t.includes('energy')) return 'headline'
  return 'other'
}

// ─── 시리즈 적재 ────────────────────────────────────────────────────────────────

/**
 * 단일 시리즈를 FRED에서 수집해 Supabase에 upsert한다.
 * observationStart 지정 시 해당 날짜 이후의 관측값만 수집 (증분 모드).
 */
async function ingestSeries(seriesId: string, observationStart?: string): Promise<number> {
  const db = getSupabase()

  // 1. 메타 upsert
  const meta = await fetchSeriesMeta(seriesId)
  const { error: seriesErr } = await db.from('series').upsert({
    series_id:    meta.id,
    title:        meta.title,
    units:        meta.units,
    frequency:    meta.frequency,
    seasonal_adj: meta.seasonal_adjustment.startsWith('Seasonally') ? 'SA' : 'NSA',
    category:     inferCategory(meta.id, meta.title),
    last_updated: meta.last_updated,
  })
  if (seriesErr) throw new Error(`series upsert 실패: ${seriesErr.message}`)

  // 2. 관측값 upsert (전체 또는 observationStart 이후, 500건 청크)
  const observations = await fetchObservations(seriesId, observationStart)
  const rows = observations
    .filter((o) => o.value !== '.')
    .map((o) => ({
      series_id: seriesId,
      date:      o.date,
      value:     parseFloat(o.value),
    }))

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    const { error } = await db.from('observation').upsert(chunk, {
      onConflict: 'series_id,date',
    })
    if (error) throw new Error(`observation upsert 실패: ${error.message}`)
  }

  return rows.length
}

// ─── 시리즈 발견 ────────────────────────────────────────────────────────────────

interface FailedSeries { id: string; reason: string }

async function discoverSeriesIds(): Promise<string[]> {
  console.log(`[발견] FRED PPI 카테고리 트리 재귀 탐색 시작 (루트=${PPI_ROOT_CATEGORY})`)
  const seen = new Set<string>()
  const visited = new Set<number>()  // 카테고리 중복/순환 방지
  const stack: number[] = [PPI_ROOT_CATEGORY]
  let catCount = 0

  while (stack.length > 0) {
    const catId = stack.pop() as number
    if (visited.has(catId)) continue
    visited.add(catId)
    catCount++

    // 1) 이 카테고리에 직속된 Monthly 시리즈 수집
    try {
      const series = await fetchCategorySeriesIds(catId)
      for (const s of series) seen.add(s.id)
    } catch (e) {
      console.error(`\n[발견] 카테고리(${catId}) 시리즈 조회 실패: ${e}`)
    }
    await new Promise((r) => setTimeout(r, DISCOVER_DELAY_MS))

    // 2) 하위 카테고리를 stack에 추가해 계속 내려감
    try {
      const children = await fetchCategoryChildren(catId)
      for (const c of children) if (!visited.has(c.id)) stack.push(c.id)
    } catch (e) {
      console.error(`\n[발견] 카테고리(${catId}) 하위 조회 실패: ${e}`)
    }
    await new Promise((r) => setTimeout(r, DISCOVER_DELAY_MS))

    process.stdout.write(
      `\r[발견] 카테고리 ${catCount}개 탐색 | 누적 시리즈 ${seen.size}개 | 대기열 ${stack.length}`,
    )
  }

  // 헤드라인 시드를 항상 포함 — 카테고리 트리에서 누락돼도 대시보드 지표는 보장
  for (const id of HEADLINE_IDS) seen.add(id)
  seen.add(CORE_REFERENCE_SERIES)

  const ids = Array.from(seen).sort()
  console.log(`\n[발견] 최종: ${ids.length}개 시리즈 (카테고리 ${catCount}개, 헤드라인 시드 포함, 중복 제거 완료)`)
  return ids
}

// ─── 증분 수집: DB 최신 관측 날짜 일괄 조회 ──────────────────────────────────────

/**
 * 각 시리즈의 DB 최신 관측 날짜를 RPC로 일괄 조회한다.
 * 실패 시 빈 Map 반환 → 전체 재수집으로 안전하게 fallback.
 */
async function fetchLatestObsDates(): Promise<Map<string, string>> {
  const db = getSupabase()
  const { data, error } = await db.rpc('get_series_latest_dates')
  if (error) {
    console.warn(`[증분] 최신 날짜 조회 실패: ${error.message} — 전체 재수집으로 전환`)
    return new Map()
  }
  return new Map(
    ((data ?? []) as { series_id: string; latest_date: string }[])
      .map((r) => [r.series_id, r.latest_date]),
  )
}

// ─── 적재 실행 ────────────────────────────────────────────────────────────────

async function runIngest(
  ids: string[],
  obsStartMap = new Map<string, string>(),
): Promise<FailedSeries[]> {
  const total = ids.length
  const failed: FailedSeries[] = []
  let ok = 0

  for (let i = 0; i < total; i++) {
    const id = ids[i]
    const prefix = `[${String(i + 1).padStart(String(total).length, ' ')}/${total}]`
    const obsStart = obsStartMap.get(id)
    const label = obsStart ? `(증분 ${obsStart}~) ` : ''
    process.stdout.write(`${prefix} ${id} ${label}적재 중...`)

    try {
      const count = await ingestSeries(id, obsStart)
      ok++
      process.stdout.write(`\r${prefix} ${id} → ${count}건 완료\n`)
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      failed.push({ id, reason })
      process.stdout.write(`\r${prefix} ${id} FAIL: ${reason}\n`)
    }

    // FRED 레이트 제한 보호 (연속 요청 사이 200ms)
    if (i < total - 1) await new Promise((r) => setTimeout(r, 200))
  }

  console.log(`\n[완료] 성공: ${ok}건 / 실패: ${failed.length}건`)
  return failed
}

// ─── 추세 지표 뷰 갱신 ──────────────────────────────────────────────────────────

/**
 * 적재된 새 데이터를 추세 지표(series_trend_mv)에 반영.
 * 이 뷰는 자동 갱신되지 않으므로 적재 후 반드시 새로고침해야 화면 태그가 최신화된다.
 * 실패해도 적재 자체는 성공이므로 경고만 남기고 진행한다.
 */
async function refreshTrendView(): Promise<void> {
  const db = getSupabase()
  process.stdout.write('[갱신] series_trend_mv 추세 지표 뷰 새로고침 중...')
  const { error } = await db.rpc('refresh_series_trend_mv')
  if (error) {
    process.stdout.write(`\r[갱신] 실패: ${error.message}\n`)
    console.warn('[안내] 수동 갱신: REFRESH MATERIALIZED VIEW CONCURRENTLY series_trend_mv;')
  } else {
    process.stdout.write('\r[갱신] series_trend_mv 새로고침 완료              \n')
  }
}

// ─── AI 한줄평 생성·저장 ────────────────────────────────────────────────────────

/**
 * 갱신된 series_trend_mv에서 8개 헤드라인 지표를 읽어 LLM 한줄평을 생성하고
 * dashboard_insight에 upsert한다. 화면은 이 저장값만 읽는다(빠름 원칙).
 * 키가 없거나 호출 실패해도 적재 자체는 성공이므로 경고만 남기고 진행한다.
 */
async function generateAndStoreInsight(): Promise<void> {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('[한줄평] GEMINI_API_KEY 없음 — 생성 스킵')
    return
  }
  const db = getSupabase()
  process.stdout.write('[한줄평] 대시보드 지표 수집 중...')

  // 대시보드 조립 결과를 그대로 재사용 → 화면과 동일한 지표(헤드라인·폭·PCE·마진)로 일관성 보장
  let dash
  try {
    dash = await fetchDashboard()
  } catch (e) {
    process.stdout.write(`\r[한줄평] 지표 조회 실패: ${e instanceof Error ? e.message : String(e)}\n`)
    return
  }
  if (!dash.refDate) {
    process.stdout.write('\r[한줄평] 기준월 산출 불가 — 스킵                 \n')
    return
  }

  // 근원(PPIFES) YoY — 헤드라인엔 없으므로 별도 조회 (헤드라인↔코어 비교용)
  const { data: coreRow } = await db
    .from('series_trend_mv')
    .select('yoy')
    .eq('series_id', CORE_REFERENCE_SERIES)
    .maybeSingle()
  const coreYoy = coreRow?.yoy != null ? Number(coreRow.yoy) : null

  const headline: InsightMetricInput[] = dash.headline.map((h) => ({
    label: h.label, yoy: h.yoy, mom: h.mom, ann3m: h.ann3m, accel3m: h.accel3m,
  }))
  const marginGap = dash.marginSpread?.pairs.find((p) => p.key === 'headline')?.gap ?? null

  process.stdout.write('\r[한줄평] LLM 생성 중...                          ')
  try {
    const { body, model } = await generateInsight({
      refDate: dash.refDate,
      headline,
      coreYoy,
      breadthPct: dash.briefing?.breadthPct ?? null,
      pceRead: dash.briefing?.pceRead ?? null,
      marginGap,
      topAccelLabel: dash.briefing?.topAccelLabel ?? null,
      topAccelValue: dash.briefing?.topAccelValue ?? null,
    })
    const { error: upErr } = await db
      .from('dashboard_insight')
      .upsert(
        {
          ref_date: dash.refDate,
          body,
          model,
          metrics: { headline, coreYoy, breadthPct: dash.briefing?.breadthPct ?? null, pceRead: dash.briefing?.pceRead ?? null, marginGap },
        },
        { onConflict: 'ref_date' },
      )
    if (upErr) {
      process.stdout.write(`\r[한줄평] 저장 실패: ${upErr.message}\n`)
      return
    }
    process.stdout.write('\r[한줄평] 생성·저장 완료                          \n')
    console.log(`  └ "${body}"`)
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    process.stdout.write(`\r[한줄평] 생성 실패: ${reason}\n`)
  }
}

// ─── 발표 일정 갱신 ──────────────────────────────────────────────────────────

/**
 * FRED release/dates(PPI=46)에서 다음/직전 발표일을 받아 release_schedule에 upsert한다.
 * 화면은 이 저장값만 읽어 D-day를 표기한다(런타임 FRED 호출 금지 원칙).
 * 실패해도 적재 자체는 성공이므로 경고만 남기고 진행한다.
 */
async function updateReleaseSchedule(): Promise<void> {
  const db = getSupabase()
  process.stdout.write('[발표일정] FRED release/dates 조회 중...')
  try {
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const now = new Date()
    const start = iso(new Date(now.getTime() - 60 * 864e5))
    const end = iso(new Date(now.getTime() + 200 * 864e5))
    const dates = await fetchReleaseDates(PPI_RELEASE_ID, { realtimeStart: start, realtimeEnd: end })

    const todayStr = iso(now)
    const nextDate = dates.find((d) => d >= todayStr) ?? null
    const pastDates = dates.filter((d) => d < todayStr)
    const lastDate = pastDates.length ? pastDates[pastDates.length - 1] : null

    const { error } = await db.from('release_schedule').upsert(
      {
        release_id: PPI_RELEASE_ID,
        release_name: 'Producer Price Index',
        next_date: nextDate,
        last_date: lastDate,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'release_id' },
    )
    if (error) {
      process.stdout.write(`\r[발표일정] 저장 실패: ${error.message}\n`)
      return
    }
    process.stdout.write(`\r[발표일정] 다음 발표 ${nextDate ?? '미정'} · 직전 ${lastDate ?? '—'}        \n`)
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    process.stdout.write(`\r[발표일정] 조회 실패: ${reason}\n`)
  }
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

async function main() {
  const isRetry       = process.argv.includes('--retry')
  const isHeadline    = process.argv.includes('--headline-only')
  const isIncremental = process.argv.includes('--incremental')

  let ids: string[]
  const obsStartMap = new Map<string, string>()

  if (isRetry) {
    // retry 모드: failed-series.json 에서 목록 읽기
    if (!fs.existsSync(FAILED_FILE)) {
      console.log('[retry] failed-series.json 없음 — 재시도할 항목이 없습니다.')
      return
    }
    const raw = JSON.parse(fs.readFileSync(FAILED_FILE, 'utf-8')) as FailedSeries[]
    if (!raw.length) {
      console.log('[retry] 재시도할 실패 항목이 없습니다.')
      return
    }
    ids = raw.map((f) => f.id)
    console.log(`[retry] ${ids.length}개 시리즈 재시도`)

  } else if (isHeadline) {
    // 헤드라인 전용 모드: 8개 헤드라인 + 코어 참조(PPIFES)만
    ids = [...HEADLINE_IDS, CORE_REFERENCE_SERIES]
    console.log(`[헤드라인] ${ids.length}개 시리즈만 수집 (카테고리 탐색 생략)`)

  } else {
    // 일반 모드: 자동 발견
    ids = await discoverSeriesIds()
  }

  // 비-retry 경로: PCE 반영 PPI + 마진용 CPI + 파이프라인 단계 시드를 항상 포함.
  // (CPI는 PPI 카테고리 트리 밖이라 자동 발견되지 않으므로 명시 시드 필수.
  //  파이프라인 WPSID*는 트리 안에 있지만 헤드라인 모드가 발견을 생략하므로
  //  발표일 빠른 갱신(ingest:update)에서 누락되지 않게 시드로 보장)
  if (!isRetry) {
    const before = ids.length
    ids = Array.from(new Set([...ids, ...PCE_PPI_IDS, ...CPI_IDS, ...PIPELINE_IDS]))
    const added = ids.length - before
    if (added > 0) console.log(`[시드] PCE/CPI/파이프라인 시리즈 ${added}개 추가 포함 (총 ${ids.length})`)
  }

  // 증분 모드: retry는 실패 재시도이므로 증분 미적용
  if (isIncremental && !isRetry) {
    console.log(`[증분] 기존 DB 데이터 이후 신규·갱신분만 수집합니다 (리비전 보호: -${INCREMENTAL_REVISION_BUFFER_MONTHS}개월)`)
    const latestDates = await fetchLatestObsDates()
    for (const id of ids) {
      const latest = latestDates.get(id)
      if (latest) obsStartMap.set(id, subtractMonths(latest, INCREMENTAL_REVISION_BUFFER_MONTHS))
    }
    const covered = obsStartMap.size
    console.log(`  - ${covered}개 기존 시리즈: 최신 날짜 -${INCREMENTAL_REVISION_BUFFER_MONTHS}개월부터 수집`)
    console.log(`  - ${ids.length - covered}개 신규 시리즈: 전체 이력 수집`)
  }

  const failed = await runIngest(ids, obsStartMap)

  // 적재된 새 데이터를 추세 지표 뷰에 반영 (화면 태그 최신화)
  await refreshTrendView()

  // 다음 PPI 발표일 갱신 (화면 D-day 표기용, 실패해도 적재는 성공)
  await updateReleaseSchedule()

  // 갱신된 헤드라인 지표로 AI 한줄평 생성·저장 (실패해도 적재는 성공)
  await generateAndStoreInsight()

  if (failed.length > 0) {
    console.log('\n[실패 목록]')
    for (const f of failed) console.log(`  - ${f.id}: ${f.reason}`)
    fs.writeFileSync(FAILED_FILE, JSON.stringify(failed, null, 2), 'utf-8')
    console.log(`\n[저장] 실패 목록 → ${FAILED_FILE}`)
    console.log('[안내] 재시도: npm run ingest:retry')
  } else {
    // 성공 시 실패 파일 정리
    if (fs.existsSync(FAILED_FILE)) fs.unlinkSync(FAILED_FILE)
    console.log('[완료] 모든 시리즈 적재 성공')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
