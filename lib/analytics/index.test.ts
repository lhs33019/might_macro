// lib/analytics 단위 테스트 — Node 내장 러너(node:test) 사용
// 실행: npm test  (node --import tsx --test lib/analytics/*.test.ts)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcMoM, calcYoY, classifyTrend, calcAnnualized3M, calcAccel3M, calcContribution,
  calcAnnualized, calcCarryover, calcMarginGap, calcBreadth,
  projectYoyPath, lastNonNullIndex, isHistoricalExtreme,
} from './index'
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

// ─── Annualized N · 캐리오버 · 마진갭 · 폭 ───────────────────
test('calcAnnualized: 6개월 +5% → 연율 ((1.05)^2-1)=+10.25%', () => {
  assert.ok(near(calcAnnualized(105, 100, 6), 10.25))
})
test('calcAnnualized(months=3) === calcAnnualized3M', () => {
  assert.ok(near(calcAnnualized(105, 100, 3), calcAnnualized3M(105, 100)))
})
test('calcCarryover: latest 110, 11개월 전 100 → +10%', () => {
  assert.ok(near(calcCarryover(110, 100), 10))
})
test('calcMarginGap: PPI 5 − CPI 3 = +2%p (마진 압박)', () => {
  assert.ok(near(calcMarginGap(5, 3), 2))
})
test('calcBreadth: [+,+,-,null] → up 2 / total 3 / 66.7%', () => {
  const r = calcBreadth([0.4, 1.2, -0.3, null])
  assert.equal(r.up, 2)
  assert.equal(r.total, 3)
  assert.ok(near(r.pct!, (2 / 3) * 100))
})
test('calcBreadth: 전부 null → pct null', () => {
  const r = calcBreadth([null, null])
  assert.equal(r.total, 0)
  assert.equal(r.pct, null)
})

// ─── 부문 기여도 분해 ────────────────────────────────────────
test('calcContribution: 가중치 × MoM', () => {
  const r = calcContribution([
    { key: 'goods',    label: '재화',   weight: 0.33, mom: 0.6 },
    { key: 'services', label: '서비스', weight: 0.65, mom: 0.2 },
  ])
  assert.equal(r.length, 2)
  assert.ok(near(r[0].value, 0.198))   // 0.33 * 0.6
  assert.ok(near(r[1].value, 0.13))    // 0.65 * 0.2
})
test('calcContribution: mom이 null인 부문은 제외', () => {
  const r = calcContribution([
    { key: 'goods',    label: '재화',   weight: 0.33, mom: null },
    { key: 'services', label: '서비스', weight: 0.65, mom: 0.2 },
  ])
  assert.equal(r.length, 1)
  assert.equal(r[0].key, 'services')
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

// ─── 베이스효과 시뮬레이션 (projectYoyPath) ──────────────────
// 13개 실측 (t=12, v_t=112): 100, 101, ..., 112 — 매월 +1pt 선형
const linear13 = Array.from({ length: 13 }, (_, i) => 100 + i)

test('projectYoyPath: MoM=0의 첫 달은 calcCarryover와 정합', () => {
  const p = projectYoyPath(linear13, 0)
  // k=1의 분모 = v_{t-11} = values[1] = 101, 값 유지(112)
  assert.ok(near(p[0].yoy!, calcCarryover(112, 101)))
})
test('projectYoyPath: flat 이력 + MoM=0.2 → 12개월째 (1.002^12-1)*100 수렴', () => {
  const flat = Array.from({ length: 24 }, () => 100)
  const p = projectYoyPath(flat, 0.2)
  const limit = (Math.pow(1.002, 12) - 1) * 100
  assert.ok(near(p[11].yoy!, limit))
})
test('projectYoyPath: flat 100 + MoM=1 손계산 (k=1: 101/+1%, k=2: +2.01%)', () => {
  const flat = Array.from({ length: 13 }, () => 100)
  const p = projectYoyPath(flat, 1)
  assert.ok(near(p[0].value, 101))
  assert.ok(near(p[0].yoy!, 1))
  assert.ok(near(p[1].yoy!, 2.01))
})
test('projectYoyPath: 분모 결측은 해당 월만 null (전파 안 함)', () => {
  const vals: (number | null)[] = [...linear13]
  vals[1] = null // k=1의 분모(v_{t-11})만 결측
  const p = projectYoyPath(vals, 0)
  assert.equal(p[0].yoy, null)
  assert.notEqual(p[1].yoy, null)
  assert.ok(near(p[0].value, 112)) // 레벨은 계산됨
})
test('projectYoyPath: k>12은 분모도 프로젝션 → 전부 수렴값', () => {
  const p = projectYoyPath(linear13, 0.5, 18)
  const limit = (Math.pow(1.005, 12) - 1) * 100
  for (let k = 12; k < 18; k++) assert.ok(near(p[k].yoy!, limit))
})
test('projectYoyPath: 빈 배열·전부 null → []', () => {
  assert.deepEqual(projectYoyPath([], 0.2), [])
  assert.deepEqual(projectYoyPath([null, null], 0.2), [])
})
test('projectYoyPath: 이력 12개월 미만 → 초기 k는 yoy null, 분모 생기면 계산', () => {
  const short = [100, 101, 102, 103, 104, 105] // 길이 6, t=5
  const p = projectYoyPath(short, 0)
  // k=1..6: 분모 인덱스 t+k-12 < 0 → null. k=7: 분모 = values[0] = 100
  for (let i = 0; i < 6; i++) assert.equal(p[i].yoy, null)
  assert.ok(near(p[6].yoy!, calcYoY(105, 100)))
})
test('projectYoyPath: 트레일링 null은 건너뛰고 마지막 실측을 앵커로', () => {
  const vals: (number | null)[] = [...linear13, null] // 끝에 결측
  const p = projectYoyPath(vals, 1)
  assert.ok(near(p[0].value, 112 * 1.01))
  assert.equal(lastNonNullIndex(vals), 12)
})
test('projectYoyPath: 앵커 ≤ 0 또는 g ≤ 0 → []', () => {
  assert.deepEqual(projectYoyPath([100, 0], 0.2), [])
  assert.deepEqual(projectYoyPath(linear13, -100), [])
})
test('projectYoyPath: horizon=0 → []', () => {
  assert.deepEqual(projectYoyPath(linear13, 0.2, 0), [])
})

// ─── 역사적극단 판정 (isHistoricalExtreme) ──────────────────
test('isHistoricalExtreme: 경계 — P95·P5는 극단, 그 안쪽은 아님', () => {
  assert.equal(isHistoricalExtreme(95), true)
  assert.equal(isHistoricalExtreme(5), true)
  assert.equal(isHistoricalExtreme(94.99), false)
  assert.equal(isHistoricalExtreme(5.01), false)
})
test('isHistoricalExtreme: 끝값 P100·P0은 극단', () => {
  assert.equal(isHistoricalExtreme(100), true)
  assert.equal(isHistoricalExtreme(0), true)
})
test('isHistoricalExtreme: 중간값은 극단 아님', () => {
  assert.equal(isHistoricalExtreme(50), false)
})
test('isHistoricalExtreme: null(표본 부족)은 극단 아님', () => {
  assert.equal(isHistoricalExtreme(null), false)
})
