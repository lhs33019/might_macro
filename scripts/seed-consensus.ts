/**
 * 시장 컨센서스(예상치) 적재 스크립트 — data/consensus.seed.json → Supabase consensus 테이블
 * 실행: npm run ingest:consensus
 *
 * 컨센서스는 FRED에 없으므로 수동 입력이다. data/consensus.seed.json 을 편집해
 * 실제 시장 예상치(Bloomberg/Reuters 등)와 출처(source)를 넣고 이 스크립트로 upsert 한다.
 * (series_id, date) 기준 멱등 upsert — 같은 발표월을 다시 넣으면 갱신된다.
 *
 * 주의: source 는 화면에 그대로 노출되므로(정확성 §8) 실제 출처를 정확히 적는다.
 *       'Demo' 로 남겨두면 대시보드 서프라이즈 옆에 'Demo' 가 표기된다.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { createClient } from '@supabase/supabase-js'

interface ConsensusSeedRow {
  series_id: string
  date: string
  consensus_yoy: number
  source: string
  note?: string | null
}

const SEED_FILE = path.join(process.cwd(), 'data', 'consensus.seed.json')

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase 환경변수 누락 (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
  }
  return createClient(url, key)
}

function loadSeed(): ConsensusSeedRow[] {
  if (!fs.existsSync(SEED_FILE)) {
    throw new Error(`시드 파일 없음: ${SEED_FILE}`)
  }
  const raw = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8')) as unknown
  if (!Array.isArray(raw)) throw new Error('consensus.seed.json 은 배열이어야 합니다.')

  return raw.map((r, i): ConsensusSeedRow => {
    const row = r as Record<string, unknown>
    const series_id = row.series_id
    const date = row.date
    const consensus_yoy = row.consensus_yoy
    const source = row.source
    if (typeof series_id !== 'string' || typeof date !== 'string') {
      throw new Error(`[${i}] series_id·date 는 문자열이어야 합니다.`)
    }
    if (typeof consensus_yoy !== 'number' || Number.isNaN(consensus_yoy)) {
      throw new Error(`[${i}] consensus_yoy 는 숫자여야 합니다. (${series_id})`)
    }
    if (typeof source !== 'string' || source.trim() === '') {
      throw new Error(`[${i}] source(출처)는 필수입니다. (${series_id})`)
    }
    return {
      series_id,
      date,
      consensus_yoy,
      source,
      note: typeof row.note === 'string' ? row.note : null,
    }
  })
}

async function main() {
  const db = getSupabase()
  const rows = loadSeed()
  console.log(`[consensus] ${rows.length}건 upsert 시작 (${SEED_FILE})`)

  const { error } = await db
    .from('consensus')
    .upsert(rows, { onConflict: 'series_id,date' })
  if (error) throw new Error(`consensus upsert 실패: ${error.message}`)

  const demo = rows.filter((r) => r.source.toLowerCase() === 'demo').length
  console.log(`[consensus] 완료 — ${rows.length}건 적재` + (demo > 0 ? ` (그중 ${demo}건은 source='Demo' — 실제 컨센서스로 교체 권장)` : ''))
}

main().catch((e) => {
  console.error('[consensus] 실패:', e instanceof Error ? e.message : e)
  process.exit(1)
})
