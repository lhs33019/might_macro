/**
 * FRED → Supabase 적재 스크립트
 * 실행: npm run ingest              (전체 발견 → 적재)
 *       npm run ingest:retry        (이전 실패분만 재시도)
 *
 * 기능:
 *  - FRED /series/search 와 /category/series로 PPI 월간 시리즈 자동 발견
 *  - [n/total] 형식 진행상황 실시간 출력
 *  - 개별 시리즈 실패 시 오류 기록 후 나머지 계속 진행
 *  - 완료 후 실패 목록을 failed-series.json에 저장
 *  - --retry 플래그: failed-series.json의 목록만 재시도
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  fetchSeriesMeta,
  fetchObservations,
  fetchCategoryChildren,
  fetchCategorySeriesIds,
} from '../lib/fred/client'

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

// ─── Supabase 클라이언트 ──────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase 환경변수 누락 (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
  return createClient(url, key)
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

async function ingestSeries(seriesId: string): Promise<number> {
  const db = getSupabase()

  // 1. 메타 upsert
  const meta = await fetchSeriesMeta(seriesId)
  const { error: seriesErr } = await db.from('series').upsert({
    series_id:   meta.id,
    title:       meta.title,
    units:       meta.units,
    frequency:   meta.frequency,
    seasonal_adj: meta.seasonal_adjustment.startsWith('Seasonally') ? 'SA' : 'NSA',
    category:    inferCategory(meta.id, meta.title),
    last_updated: meta.last_updated,
  })
  if (seriesErr) throw new Error(`series upsert 실패: ${seriesErr.message}`)

  // 2. 관측값 upsert (과거 전체, 500건 청크)
  const observations = await fetchObservations(seriesId)
  const rows = observations
    .filter((o) => o.value !== '.')
    .map((o) => ({
      series_id: seriesId,
      date:  o.date,
      value: parseFloat(o.value),
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

  const ids = Array.from(seen).sort()
  console.log(`\n[발견] 최종: ${ids.length}개 시리즈 (카테고리 ${catCount}개, 중복 제거 완료)`)
  return ids
}

// ─── 적재 실행 ────────────────────────────────────────────────────────────────

async function runIngest(ids: string[]): Promise<FailedSeries[]> {
  const total = ids.length
  const failed: FailedSeries[] = []
  let ok = 0

  for (let i = 0; i < total; i++) {
    const id = ids[i]
    const prefix = `[${String(i + 1).padStart(String(total).length, ' ')}/${total}]`
    process.stdout.write(`${prefix} ${id} 적재 중...`)

    try {
      const count = await ingestSeries(id)
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

// ─── 메인 ────────────────────────────────────────────────────────────────────

async function main() {
  const isRetry = process.argv.includes('--retry')

  let ids: string[]

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
  } else {
    // 일반 모드: 자동 발견
    ids = await discoverSeriesIds()
  }

  const failed = await runIngest(ids)

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
