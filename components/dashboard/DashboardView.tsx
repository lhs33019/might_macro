'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Download, LayoutGrid } from 'lucide-react'
import { KpiCard } from '@/components/KpiCard'
import { Segmented, Toggle } from '@/components/controls'
import { Card, Legend } from '@/components/Card'
import { LineChart, LineChartSkeleton, type ChartPoint } from '@/components/charts/LineChart'
import { Heatmap } from '@/components/charts/Heatmap'
import { InsightBanner } from './InsightBanner'
import { SectorAnn3mBars } from './SectorAnn3mBars'
import { calcAnnualized3M } from '@/lib/analytics'
import { isApiError } from '@/lib/types'
import type {
  DashboardResponse,
  ObservationListResponse,
  ObservationItem,
} from '@/lib/types'

const PERIODS = [
  { v: '1Y',  label: '1Y',  n: 12 },
  { v: '3Y',  label: '3Y',  n: 36 },
  { v: '5Y',  label: '5Y',  n: 60 },
  { v: 'ALL', label: '전체', n: 9999 },
] as const
type Period = typeof PERIODS[number]['v']
type Mode   = 'ann3m' | 'mom' | 'yoy'

function fmtPct(v: number | null): string {
  if (v == null) return '–'
  return (v > 0 ? '+' : '') + v.toFixed(1)
}
function dirOf(v: number | null): 'up' | 'down' | 'flat' {
  if (v == null) return 'flat'
  return v > 0.02 ? 'up' : v < -0.02 ? 'down' : 'flat'
}
function useIsMobile() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 760)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return mobile
}

interface DashboardViewProps {
  data: DashboardResponse
}

export function DashboardView({ data }: DashboardViewProps) {
  const isMobile = useIsMobile()
  const { headline, sectorAnn3m, heatmap, insight, refDate } = data

  // 추세 차트 — 선택된 헤드라인 시리즈 + 모드
  const [selectedId, setSelectedId] = useState<string>(headline[0]?.seriesId ?? 'PPIACO')
  const [mode, setMode]     = useState<Mode>('ann3m')
  const [period, setPeriod] = useState<Period>('3Y')
  const [obs, setObs]       = useState<ObservationListResponse | null>(null)
  const [obsLoading, setObsLoading] = useState(false)

  const selectedMeta = headline.find((h) => h.seriesId === selectedId) ?? headline[0]

  // 선택 시리즈 관측값 온디맨드 로드 (기존 엔드포인트 재사용)
  // effect 본문에서 동기 setState를 피하려 비동기 로더로 분리한다.
  const loadObs = useCallback((id: string, isAlive: () => boolean) => {
    setObsLoading(true)
    setObs(null)
    fetch(`/api/series/${id}/observations`)
      .then((r) => r.json())
      .then((json: unknown) => {
        if (!isAlive()) return
        setObs(isApiError(json) ? null : (json as ObservationListResponse))
      })
      .catch(() => { if (isAlive()) setObs(null) })
      .finally(() => { if (isAlive()) setObsLoading(false) })
  }, [])

  useEffect(() => {
    let alive = true
    // 선택 시리즈 변경 시 관측값 재조회 — 외부(API) 동기화 목적의 정당한 effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadObs(selectedId, () => alive)
    return () => { alive = false }
  }, [selectedId, loadObs])

  const n = PERIODS.find((p) => p.v === period)!.n

  // 모드별 차트 포인트 (ann3m는 관측값에서 롤링 3M SAAR 계산)
  const chartPoints = useMemo<ChartPoint[]>(() => {
    if (!obs) return []
    const items = obs.data
    const computed = items.map((o: ObservationItem, i): ChartPoint => {
      let value: number | null
      if (mode === 'mom') value = o.mom
      else if (mode === 'yoy') value = o.yoy
      else {
        const prev3 = items[i - 3]
        value = o.value != null && prev3?.value != null && prev3.value > 0
          ? calcAnnualized3M(o.value, prev3.value)
          : null
      }
      const d = new Date(o.date)
      return { date: o.date, y: d.getFullYear(), m: d.getMonth() + 1, index: o.value ?? 0, value, consensus: null }
    })
    return computed.slice(Math.max(0, computed.length - n)).filter((p) => p.value != null)
  }, [obs, mode, n])

  // 히트맵 — 8개 시리즈의 셀을 공통 월축으로 정규화
  const { heatRows, heatMonths } = useMemo(() => {
    const dates = Array.from(
      new Set(heatmap.flatMap((r) => r.cells.map((c) => c.date))),
    ).sort().slice(-8)
    const months = dates.map((dt) => {
      const d = new Date(dt)
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, date: dt }
    })
    const rows = heatmap.map((r) => {
      const byDate = new Map(r.cells.map((c) => [c.date, c.mom]))
      return { label: r.label, cells: dates.map((dt) => ({ date: dt, mom: byDate.get(dt) ?? null })) }
    })
    return { heatRows: rows, heatMonths: months }
  }, [heatmap])

  const modeLabel = mode === 'ann3m' ? 'Annualized 3M' : mode === 'mom' ? '전월비(MoM)' : '전년동월비(YoY)'
  const refMonth = refDate ? refDate.slice(0, 7).replace('-', '. ') : '—'

  const handleSelectSeries = useCallback((id: string) => setSelectedId(id), [])

  return (
    <div className="nw-app">
      {/* ── HEADER ── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '18px 0',
        borderBottom: '1px solid var(--border-subtle)', marginBottom: 24, flexWrap: 'wrap',
      }}>
        <div className="nw-applogo">
          <Image src="/assets/ppi-mark.png" alt="PPI" width={46} height={46} priority />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="t-title" style={{ fontSize: 15 }}>미국 생산자물가지수 · PPI</span>
          <span className="t-caption">Producer Price Index · Data. Insight. Impact.</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ textAlign: 'right' }}>
            <div className="t-label" style={{ marginBottom: 3 }}>기준월</div>
            <div className="t-data" style={{ fontSize: 13 }}>{refMonth}</div>
          </div>
          <Link href="/series" style={{ textDecoration: 'none' }}>
            <button className="nw-btn-ghost" aria-label="시리즈 탐색">
              <LayoutGrid size={16} /> 시리즈 탐색
            </button>
          </Link>
          <button className="nw-btn-ghost" aria-label="내보내기">
            <Download size={16} /> 내보내기
          </button>
        </div>
      </header>

      {/* ── AI 한줄평 ── */}
      <InsightBanner insight={insight} />

      {/* ── KPI ROW (8 헤드라인, 주값=Annualized 3M) ── */}
      <div className="nw-kpi-grid">
        {headline.map((k) => (
          <KpiCard
            key={k.seriesId}
            label={`${k.label} · 3M(연율)`}
            sub={k.seasonalAdj}
            value={fmtPct(k.ann3m)}
            unit="%"
            dir={dirOf(k.ann3m)}
            deltaDir={dirOf(k.accel3m)}
            deltaLabel={
              k.accel3m != null
                ? `실질가속 ${(k.accel3m >= 0 ? '+' : '') + k.accel3m.toFixed(1)}%p`
                : undefined
            }
            foot={`${k.seriesId} · YoY ${fmtPct(k.yoy)}% · MoM ${fmtPct(k.mom)}%${k.seasonalAdj === 'NSA' ? ' · NSA(계절성주의)' : ''}`}
          />
        ))}
      </div>

      {/* ── MAIN GRID ── */}
      <div className="nw-grid">
        {/* trend chart */}
        <Card
          eyebrow={`${selectedMeta?.label ?? ''} · ${selectedMeta?.seriesId ?? ''}`}
          title={`${modeLabel} 추이`}
          style={{ gridColumn: isMobile ? 'auto' : '1 / 2' }}
          right={
            <Toggle
              options={[
                { v: 'ann3m', label: '3M연율' },
                { v: 'mom', label: 'MoM' },
                { v: 'yoy', label: 'YoY' },
              ]}
              value={mode}
              onChange={(v) => setMode(v as Mode)}
            />
          }
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <select
              className="nw-select"
              value={selectedId}
              onChange={(e) => handleSelectSeries(e.target.value)}
              aria-label="헤드라인 시리즈 선택"
            >
              {headline.map((h) => (
                <option key={h.seriesId} value={h.seriesId}>{h.label} ({h.seriesId})</option>
              ))}
            </select>
            <Segmented options={[...PERIODS]} value={period} onChange={(v) => setPeriod(v as Period)} />
          </div>

          {obsLoading ? (
            <LineChartSkeleton h={isMobile ? 240 : 340} />
          ) : chartPoints.length === 0 ? (
            <div className="t-caption" style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-lo)' }}>
              선택 기간 내 데이터 없음
            </div>
          ) : (
            <LineChart points={chartPoints} unit="%" isMobile={isMobile} />
          )}

          <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <Legend color="var(--accent)" label={modeLabel} line />
            {selectedMeta?.seasonalAdj === 'NSA' && mode === 'ann3m' && (
              <span className="t-caption" style={{ marginLeft: 'auto' }}>
                * NSA 계열 — Annualized 3M에 계절성 포함
              </span>
            )}
          </div>
        </Card>

        {/* sector ann3m ranking */}
        <Card
          eyebrow="부문별 모멘텀"
          title="Annualized 3M 랭킹"
          style={{ gridColumn: isMobile ? 'auto' : '2 / 3' }}
          right={<span className="t-caption">{refMonth} · 3M 연율 %</span>}
        >
          <SectorAnn3mBars items={sectorAnn3m} />
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 18 }}>
            <Legend color="var(--up)" label="상승 모멘텀" />
            <Legend color="var(--down)" label="하락 모멘텀" />
          </div>
        </Card>

        {/* heatmap — full width */}
        <Card
          eyebrow="최근 8개월"
          title="헤드라인 변동률 히트맵"
          style={{ gridColumn: isMobile ? 'auto' : '1 / 3' }}
          right={<span className="t-caption">월별 전월비(MoM) · %</span>}
        >
          <Heatmap rows={heatRows} months={heatMonths} />
        </Card>
      </div>

      {/* ── FOOTER ── */}
      <footer style={{
        marginTop: 28, paddingTop: 18, borderTop: '1px solid var(--border-subtle)',
        display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <Image src="/assets/mightmacro-lockup.png" alt="might Macro" width={104} height={26}
          style={{ opacity: 0.82, objectFit: 'contain' }} />
        <span className="t-caption">출처 FRED · might Macro 내부 DB 적재 · 실데이터</span>
        <span className="t-caption" style={{ marginLeft: 'auto' }}>
          상승 ▲ 따뜻한 색 · 하락 ▼ 차분한 색
        </span>
      </footer>
    </div>
  )
}
