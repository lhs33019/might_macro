/**
 * FRED → Supabase 적재 스크립트
 * 실행: npx tsx scripts/ingest.ts
 *
 * - series / observation 테이블에 upsert (멱등)
 * - FRED_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요
 * - 대표 지수: PPIACO (전체 PPI). 추가 시리즈는 SERIES_IDS 배열에 추가
 */

import { createClient } from '@supabase/supabase-js'
import { fetchSeriesMeta, fetchObservations } from '../lib/fred/client'

const SERIES_IDS = [
  'PPIACO', // 전체 PPI — 대표(헤드라인)
  // 추가 시리즈는 여기에 추가
]

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase 환경변수 누락')
  return createClient(url, key)
}

async function ingestSeries(seriesId: string) {
  const db = supabase()

  // 1. 시리즈 메타 upsert
  const meta = await fetchSeriesMeta(seriesId)
  const { error: seriesErr } = await db.from('series').upsert({
    series_id: meta.id,
    title: meta.title,
    units: meta.units,
    frequency: meta.frequency,
    seasonal_adj: meta.seasonal_adjustment.startsWith('Seasonally') ? 'SA' : 'NSA',
    category: 'headline', // 기본값 — 수동으로 조정 가능
    last_updated: meta.last_updated,
  })
  if (seriesErr) throw new Error(`series upsert 실패: ${seriesErr.message}`)

  // 2. 관측값 upsert (과거 전체)
  const observations = await fetchObservations(seriesId)
  const rows = observations
    .filter((o) => o.value !== '.') // 결측 제외 또는 null 처리
    .map((o) => ({
      series_id: seriesId,
      date: o.date,           // YYYY-MM-DD (FRED는 해당 월 1일)
      value: o.value === '.' ? null : parseFloat(o.value),
    }))

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await db.from('observation').upsert(chunk, {
      onConflict: 'series_id,date',
    })
    if (error) throw new Error(`observation upsert 실패: ${error.message}`)
  }

  console.log(`✓ ${seriesId}: ${rows.length}건 적재 완료`)
}

async function main() {
  for (const id of SERIES_IDS) {
    console.log(`→ 적재 시작: ${id}`)
    await ingestSeries(id)
  }
  console.log('전체 적재 완료')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
