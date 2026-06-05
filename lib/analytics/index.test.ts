// lib/analytics 단위 테스트 — Node 내장 러너(node:test) 사용
// 실행: npm test  (node --import tsx --test lib/analytics/*.test.ts)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcMoM, calcYoY, classifyTrend, calcAnnualized3M, calcAccel3M } from './index'
import type { TrendMetrics } from '@/lib/types'

// 모든 필드 null인 기본값에서 필요한 것만 덮어쓴다
function metrics(over: Partial<TrendMetrics>): TrendMetrics {
  return {
    yoy: null, yoy3m: null, yoy6m: null,
    mom: null, mom1m: null, mom2m: null,
    yoyMin10y: null, yoyMax10y: null,
    ...over,
  }
}

// ─── 기본 공식 (부동소수 허용 오차) ──────────────────────────
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9
test('calcMoM: 100 → 102 = +2%', () => {
  assert.ok(near(calcMoM(102, 100), 2))
})
test('calcYoY: 100 → 110 = +10%', () => {
  assert.ok(near(calcYoY(110, 100), 10))
})

// ─── Annualized 3M & 실질 가속도 ─────────────────────────────
test('calcAnnualized3M: 3개월간 0% → 0%', () => {
  assert.ok(near(calcAnnualized3M(100, 100), 0))
})
test('calcAnnualized3M: 3개월 +5% → 연율 약 +21.55%', () => {
  // (1.05)^4 - 1 = 0.21550625
  assert.ok(near(calcAnnualized3M(105, 100), 21.550625))
})
test('calcAnnualized3M: 3개월 -5% → 연율 약 -18.55%', () => {
  // (0.95)^4 - 1 = -0.18549375
  assert.ok(near(calcAnnualized3M(95, 100), -18.549375))
})
test('calcAccel3M: ann3m > yoy → 양수(가속)', () => {
  assert.ok(near(calcAccel3M(11.09, 5.99), 5.1))
})
test('calcAccel3M: ann3m < yoy → 음수(둔화)', () => {
  assert.ok(near(calcAccel3M(0.35, 3.57), -3.22))
})

// ─── classifyTrend 주 상태 ───────────────────────────────────
test('상승가속: YoY 양수 + ΔYoY 큰 양수', () => {
  const r = classifyTrend(metrics({ yoy: 6, yoy3m: 3 }))
  assert.equal(r.state, '상승가속')
  assert.equal(r.deltaYoy, 3)
})
test('상승둔화: YoY 양수 + ΔYoY 음수', () => {
  const r = classifyTrend(metrics({ yoy: 4, yoy3m: 5 }))
  assert.equal(r.state, '상승둔화')
})
test('하락가속: YoY 음수 + 더 음수로', () => {
  const r = classifyTrend(metrics({ yoy: -3, yoy3m: -1 }))
  assert.equal(r.state, '하락가속')
})
test('하락둔화: YoY 음수 + 0쪽으로 회복', () => {
  const r = classifyTrend(metrics({ yoy: -1, yoy3m: -3 }))
  assert.equal(r.state, '하락둔화')
})
test('횡보: |YoY| < DIR_EPS', () => {
  const r = classifyTrend(metrics({ yoy: 0.05, yoy3m: 0.0 }))
  assert.equal(r.state, '횡보')
})
test('상승지속: yoy3m 없으면 가속도 판정 불가 → 지속', () => {
  const r = classifyTrend(metrics({ yoy: 3 }))
  assert.equal(r.state, '상승지속')
  assert.equal(r.deltaYoy, null)
})

// ─── 보조 태그 ───────────────────────────────────────────────
test('추세반전: YoY 6개월 0선 교차', () => {
  const r = classifyTrend(metrics({ yoy: 2, yoy3m: 1, yoy6m: -1 }))
  assert.ok(r.tags.includes('추세반전'))
})
test('추세반전: MoM 모멘텀 반전(직전 2개월 음수 → 최신 양수)', () => {
  const r = classifyTrend(metrics({ yoy: 3, yoy3m: 2.9, yoy6m: 2.5, mom: 0.5, mom1m: -0.3, mom2m: -0.2 }))
  assert.ok(r.tags.includes('추세반전'))
})
test('10년최고: 최신 YoY가 10년 최대 근접', () => {
  const r = classifyTrend(metrics({ yoy: 11.59, yoy3m: 11.0, yoyMin10y: -1, yoyMax10y: 11.59 }))
  assert.ok(r.tags.includes('10년최고'))
  assert.ok(!r.tags.includes('10년최저'))
})
test('10년최저: 최신 YoY가 10년 최소 근접', () => {
  const r = classifyTrend(metrics({ yoy: -4, yoy3m: -2, yoyMin10y: -4.02, yoyMax10y: 5 }))
  assert.ok(r.tags.includes('10년최저'))
})
test('범위 폭이 작으면 10년 최고/최저 태그 안 붙음', () => {
  const r = classifyTrend(metrics({ yoy: 2, yoy3m: 1.9, yoyMin10y: 1.8, yoyMax10y: 2.0 }))
  assert.ok(!r.tags.includes('10년최고'))
  assert.ok(!r.tags.includes('10년최저'))
})

// ─── 데이터 부족 ─────────────────────────────────────────────
test('YoY 없으면 state=null, tags=[]', () => {
  const r = classifyTrend(metrics({ mom: 1.2 }))
  assert.equal(r.state, null)
  assert.deepEqual(r.tags, [])
})
