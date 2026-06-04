'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Download, LayoutGrid } from 'lucide-react'
import { PPI_DATA, type DataPoint } from '@/lib/data/dummy'
import { KpiCard, InfoCard } from '@/components/KpiCard'
import { Segmented, Toggle, CheckChip } from '@/components/controls'
import { Card, Legend } from '@/components/Card'
import { LineChart, LineChartSkeleton } from '@/components/charts/LineChart'
import { ContributionBars } from '@/components/charts/ContributionBars'
import { Heatmap } from '@/components/charts/Heatmap'

// ─── constants ───────────────────────────────────────────────
const PERIODS = [
  { v: '6M',  label: '6M',  n: 6 },
  { v: '1Y',  label: '1Y',  n: 12 },
  { v: '3Y',  label: '3Y',  n: 36 },
  { v: '5Y',  label: '5Y',  n: 60 },
  { v: 'ALL', label: '전체', n: 9999 },
] as const

type Period  = typeof PERIODS[number]['v']
type Metric  = 'headline' | 'core'
type Mode    = 'mom' | 'yoy'

// ─── helpers ─────────────────────────────────────────────────
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

// ─── main component ──────────────────────────────────────────
export default function DashboardPage() {
  const D = PPI_DATA
  const isMobile = useIsMobile()

  const [metric, setMetric] = useState<Metric>('headline')
  const [mode, setMode]     = useState<Mode>('mom')
  const [period, setPeriod] = useState<Period>('3Y')
  const [showConsensus, setShowConsensus] = useState(false)
  const [booting, setBooting]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // simulate initial DB load → skeletons
  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 1300)
    return () => clearTimeout(t)
  }, [])

  // brief refresh flash on filter change
  useEffect(() => {
    if (booting) return
    setRefreshing(true)
    const t = setTimeout(() => setRefreshing(false), 380)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, mode, period])

  const series: DataPoint[] = D[metric]
  const n = PERIODS.find((p) => p.v === period)!.n

  const windowed = useMemo(() => {
    const sliced = series.slice(Math.max(0, series.length - n))
    return sliced.map((p) => ({
      date: p.date,
      y: p.y,
      m: p.m,
      index: p.index,
      value: mode === 'mom' ? p.mom : p.yoy,
      consensus: mode === 'mom' ? (p.consensusMoM ?? null) : null,
    }))
  }, [series, n, mode])

  const spliceBefore =
    windowed.length > 0 && windowed[0].date < D.spliceDate

  const L = D.latest
  const isLoading = booting || refreshing

  const headlineMoMDelta =
    L.headlineMoM != null && L.headlineMoMPrev != null
      ? L.headlineMoM - L.headlineMoMPrev
      : null
  const coreMoMDelta =
    L.coreMoM != null && L.coreMoMPrev != null
      ? L.coreMoM - L.coreMoMPrev
      : null

  return (
    <div className="nw-app">
      {/* ── HEADER ── */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '18px 0',
        borderBottom: '1px solid var(--border-subtle)',
        marginBottom: 24,
        flexWrap: 'wrap',
      }}>
        <div className="nw-applogo">
          <Image src="/assets/ppi-mark.png" alt="PPI" width={46} height={46} priority />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="t-title" style={{ fontSize: 15 }}>
            미국 생산자물가지수 · PPI
          </span>
          <span className="t-caption">
            Producer Price Index · Data. Insight. Impact.
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ textAlign: 'right' }}>
            <div className="t-label" style={{ marginBottom: 3 }}>최근 발표</div>
            <div className="t-data" style={{ fontSize: 13 }}>
              {D.release.date.replace(/-/g, '.')}
            </div>
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

      {/* ── KPI ROW ── */}
      <div className="nw-kpi-row">
        <KpiCard
          loading={booting}
          label="Headline PPI · MoM"
          sub="전월비"
          value={fmtPct(L.headlineMoM)}
          unit="%"
          dir={dirOf(L.headlineMoM)}
          deltaDir={dirOf(headlineMoMDelta)}
          deltaLabel={
            headlineMoMDelta != null
              ? `${headlineMoMDelta >= 0 ? '+' : ''}${headlineMoMDelta.toFixed(1)}%p`
              : undefined
          }
          foot={`Index ${L.headlineIndex.toFixed(2)} · SA`}
        />
        <KpiCard
          loading={booting}
          label="Headline PPI · YoY"
          sub="전년동월비"
          value={fmtPct(L.headlineYoY)}
          unit="%"
          dir={dirOf(L.headlineYoY)}
          deltaDir={dirOf(L.headlineYoY)}
          deltaLabel={L.headlineYoY != null
            ? `${L.headlineYoY > 0 ? '상승' : '하락'} 추세`
            : undefined}
          foot="최종수요 · PPIFIS"
        />
        <KpiCard
          loading={booting}
          label="Core PPI · MoM"
          sub="식품·에너지 제외"
          value={fmtPct(L.coreMoM)}
          unit="%"
          dir={dirOf(L.coreMoM)}
          deltaDir={dirOf(coreMoMDelta)}
          deltaLabel={
            coreMoMDelta != null
              ? `${coreMoMDelta >= 0 ? '+' : ''}${coreMoMDelta.toFixed(1)}%p`
              : undefined
          }
          foot={`Index ${L.coreIndex.toFixed(2)} · PPIFES`}
        />
        <InfoCard
          loading={booting}
          label="기준월 · 발표일"
          value={D.release.refMonth.replace('-', '. ')}
          foot={`발표 ${D.release.date.replace(/-/g, '.')} · 다음 발표 06.12`}
        />
      </div>

      {/* ── MAIN GRID ── */}
      <div className="nw-grid">
        {/* trend chart */}
        <Card
          eyebrow={`${metric === 'headline' ? 'Headline' : 'Core'} PPI · Final Demand`}
          title={mode === 'mom' ? '전월비(MoM) 추이' : '전년동월비(YoY) 추이'}
          style={{ gridColumn: isMobile ? 'auto' : '1 / 2' }}
          right={
            <>
              <Toggle
                options={[
                  { v: 'headline', label: '헤드라인' },
                  { v: 'core', label: '근원' },
                ]}
                value={metric}
                onChange={(v) => setMetric(v as Metric)}
              />
              <Toggle
                options={[
                  { v: 'mom', label: 'MoM' },
                  { v: 'yoy', label: 'YoY' },
                ]}
                value={mode}
                onChange={(v) => setMode(v as Mode)}
              />
            </>
          }
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 14,
            flexWrap: 'wrap',
          }}>
            <Segmented options={[...PERIODS]} value={period} onChange={(v) => setPeriod(v as Period)} />
            {mode === 'mom' && (
              <CheckChip checked={showConsensus} onChange={setShowConsensus}>
                컨센서스 비교
              </CheckChip>
            )}
          </div>

          {isLoading ? (
            <LineChartSkeleton h={isMobile ? 240 : 340} />
          ) : (
            <LineChart
              points={windowed}
              showConsensus={showConsensus && mode === 'mom'}
              unit="%"
              isMobile={isMobile}
            />
          )}

          <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <Legend color="var(--accent)" label={mode === 'mom' ? '전월비' : '전년동월비'} line />
            {showConsensus && mode === 'mom' && (
              <Legend color="var(--flat)" label="컨센서스" ring />
            )}
            {spliceBefore && (
              <span className="t-caption" style={{ marginLeft: 'auto' }}>
                * {D.spliceDate.replace('-', '.')} 이전은 Finished Goods 기준 보강
              </span>
            )}
          </div>
        </Card>

        {/* contribution */}
        <Card
          eyebrow="이번 달 기여도"
          title="품목별 기여도"
          style={{ gridColumn: isMobile ? 'auto' : '2 / 3' }}
          right={
            <span className="t-caption">
              {D.release.refMonth.replace('-', '.')} · %p
            </span>
          }
        >
          {booting ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="nw-sk" style={{ width: '100%', height: 18, borderRadius: 4 }} />
              ))}
            </div>
          ) : (
            <ContributionBars items={D.contribution} />
          )}
          <div style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            gap: 18,
          }}>
            <Legend color="var(--up)" label="상승 기여" />
            <Legend color="var(--down)" label="하락 기여" />
          </div>
        </Card>

        {/* heatmap — full width */}
        <Card
          eyebrow="최근 8개월"
          title="카테고리 변동률 히트맵"
          style={{ gridColumn: isMobile ? 'auto' : '1 / 3' }}
          right={<span className="t-caption">월별 전월비(MoM) · %</span>}
        >
          {booting ? (
            <div className="nw-sk" style={{ width: '100%', height: 220, borderRadius: 8 }} />
          ) : (
            <Heatmap rows={D.heatmap} months={D.heatMonths} />
          )}
        </Card>
      </div>

      {/* ── FOOTER ── */}
      <footer style={{
        marginTop: 28,
        paddingTop: 18,
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <Image
          src="/assets/mightmacro-lockup.png"
          alt="might Macro"
          width={104}
          height={26}
          style={{ opacity: 0.82, objectFit: 'contain' }}
        />
        <span className="t-caption">
          출처 FRED · might Macro 내부 DB 적재 · 더미 데이터(개발용)
        </span>
        <span className="t-caption" style={{ marginLeft: 'auto' }}>
          상승 ▲ 따뜻한 색 · 하락 ▼ 차분한 색
        </span>
      </footer>
    </div>
  )
}
