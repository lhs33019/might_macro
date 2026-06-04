/**
 * Synthetic PPI dataset — mirrors the internal DB/API response shape.
 * Replace with real API calls (app/api/...) after Supabase wiring (M2).
 *
 * Data convention:
 *   상승(rising) = --up (warm coral)
 *   하락(falling) = --down (steel blue)
 */

export interface DataPoint {
  date: string      // 'YYYY-MM'
  y: number
  m: number
  index: number
  mom: number | null
  yoy: number | null
  consensusMoM?: number | null
}

export interface ContributionItem {
  key: string
  label: string
  value: number
  color: string
}

export interface HeatmapRow {
  label: string
  cells: Array<{ date: string; mom: number | null }>
}

export interface PPIData {
  spliceDate: string
  release: { date: string; refMonth: string }
  headline: DataPoint[]
  core: DataPoint[]
  latest: {
    headlineMoM: number | null
    headlineYoY: number | null
    headlineIndex: number
    coreMoM: number | null
    coreYoY: number | null
    coreIndex: number
    headlineMoMPrev: number | null
    coreMoMPrev: number | null
  }
  contribution: ContributionItem[]
  heatmap: HeatmapRow[]
  heatMonths: Array<{ y: number; m: number; date: string }>
}

// deterministic PRNG
function mulberry32(a: number) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildMonths(
  startY: number, startM: number, endY: number, endM: number
): Array<{ y: number; m: number }> {
  const out: Array<{ y: number; m: number }> = []
  let y = startY, m = startM
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ y, m })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

function genIndex(
  base: number,
  opts: { drift: number; spikeAmp: number; smooth: number },
  range: Array<{ y: number; m: number }>,
  rnd: () => number
): number[] {
  const { drift, spikeAmp, smooth } = opts
  let lvl = base, prevMoM = 0
  return range.map(({ y, m }) => {
    const t = y + (m - 1) / 12
    let mom = drift
    if (t >= 2008.5 && t < 2009.4) mom -= 0.55 * Math.sin(((t - 2008.5) / 0.9) * Math.PI)
    if (t >= 2015.0 && t < 2016.2) mom -= 0.10
    if (t >= 2020.2 && t < 2020.5) mom -= 1.1
    if (t >= 2020.5 && t < 2020.9) mom += 0.5
    if (t >= 2021.0 && t < 2022.5) mom += spikeAmp * Math.sin(((t - 2021.0) / 1.5) * Math.PI)
    if (t >= 2022.6 && t < 2024.0) mom -= 0.18
    mom += (rnd() - 0.5) * smooth
    mom = prevMoM * 0.35 + mom * 0.65
    prevMoM = mom
    lvl = lvl * (1 + mom / 100)
    return +lvl.toFixed(3)
  })
}

function toSeries(idx: number[], range: Array<{ y: number; m: number }>): DataPoint[] {
  return range.map((d, i) => ({
    date: `${d.y}-${String(d.m).padStart(2, '0')}`,
    y: d.y,
    m: d.m,
    index: idx[i],
    mom: i === 0 ? null : +(((idx[i] / idx[i - 1]) - 1) * 100).toFixed(2),
    yoy: i < 12 ? null : +(((idx[i] / idx[i - 12]) - 1) * 100).toFixed(2),
  }))
}

function withConsensus(arr: DataPoint[], rnd: () => number): DataPoint[] {
  return arr.map((p, i) => {
    if (i < arr.length - 36 || p.mom == null) return p
    return { ...p, consensusMoM: +(p.mom + (rnd() - 0.5) * 0.24).toFixed(2) }
  })
}

function buildData(): PPIData {
  const rnd = mulberry32(20260514)
  const RANGE = buildMonths(2005, 1, 2026, 4)

  const headlineIdx = genIndex(98.0, { drift: 0.18, spikeAmp: 0.95, smooth: 0.34 }, RANGE, rnd)
  const coreIdx     = genIndex(99.0, { drift: 0.17, spikeAmp: 0.55, smooth: 0.18 }, RANGE, rnd)
  const foodIdx     = genIndex(96.0, { drift: 0.16, spikeAmp: 1.4,  smooth: 0.7  }, RANGE, rnd)
  const energyIdx   = genIndex(92.0, { drift: 0.10, spikeAmp: 3.2,  smooth: 1.4  }, RANGE, rnd)
  const goodsIdx    = genIndex(97.0, { drift: 0.14, spikeAmp: 1.1,  smooth: 0.5  }, RANGE, rnd)
  const servicesIdx = genIndex(99.0, { drift: 0.19, spikeAmp: 0.45, smooth: 0.16 }, RANGE, rnd)

  const headline = withConsensus(toSeries(headlineIdx, RANGE), rnd)
  const core     = withConsensus(toSeries(coreIdx, RANGE), rnd)

  const last     = headline[headline.length - 1]
  const lastPrev = headline[headline.length - 2]
  const lastCore     = core[core.length - 1]
  const lastCorePrev = core[core.length - 2]

  const heatMonths = headline.slice(-8).map(p => ({ y: p.y, m: p.m, date: p.date }))

  const heatRows = [
    { label: '헤드라인', s: headline },
    { label: '근원',     s: core },
    { label: '에너지',   s: toSeries(energyIdx, RANGE) },
    { label: '식품',     s: toSeries(foodIdx, RANGE) },
    { label: '재화',     s: toSeries(goodsIdx, RANGE) },
    { label: '서비스',   s: toSeries(servicesIdx, RANGE) },
  ]
  const heatmap: HeatmapRow[] = heatRows.map(r => ({
    label: r.label,
    cells: r.s.slice(-8).map(p => ({ date: p.date, mom: p.mom })),
  }))

  return {
    spliceDate: '2009-11',
    release: { date: '2026-05-14', refMonth: '2026-04' },
    headline,
    core,
    latest: {
      headlineMoM:  last.mom,
      headlineYoY:  last.yoy,
      headlineIndex: last.index,
      coreMoM:  lastCore.mom,
      coreYoY:  lastCore.yoy,
      coreIndex: lastCore.index,
      headlineMoMPrev: lastPrev.mom,
      coreMoMPrev: lastCorePrev.mom,
    },
    contribution: [
      { key: 'energy',    label: '에너지',    value: +0.18, color: 'var(--cat-energy)' },
      { key: 'services',  label: '서비스',    value: +0.11, color: 'var(--cat-services)' },
      { key: 'trade',     label: '무역서비스', value: +0.05, color: 'var(--cat-trade)' },
      { key: 'transport', label: '운송',      value: +0.02, color: 'var(--cat-transport)' },
      { key: 'goods',     label: '재화',      value: -0.04, color: 'var(--cat-goods)' },
      { key: 'food',      label: '식품',      value: -0.08, color: 'var(--cat-food)' },
    ],
    heatmap,
    heatMonths,
  }
}

export const PPI_DATA: PPIData = buildData()
