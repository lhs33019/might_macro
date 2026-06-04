'use client'

import { useMemo } from 'react'
import { X } from 'lucide-react'
import { LineChart, LineChartSkeleton, type ChartPoint } from '@/components/charts/LineChart'
import { Segmented, Toggle } from '@/components/controls'
import type { ObservationItem } from '@/lib/types'

type Period = '6M' | '1Y' | '3Y' | '5Y' | 'ALL'
type ObsMode = 'mom' | 'yoy'

const PERIODS = [
  { v: '6M',  label: '6M',  n: 6 },
  { v: '1Y',  label: '1Y',  n: 12 },
  { v: '3Y',  label: '3Y',  n: 36 },
  { v: '5Y',  label: '5Y',  n: 60 },
  { v: 'ALL', label: '전체', n: 9999 },
] as const

interface SeriesDetailPanelProps {
  seriesId: string
  seriesTitle: string
  seriesUnits: string
  observations: readonly ObservationItem[] | null
  loading: boolean
  period: Period
  onPeriodChange: (p: Period) => void
  mode: ObsMode
  onModeChange: (m: ObsMode) => void
  onClose: () => void
}

export function SeriesDetailPanel({
  seriesId,
  seriesTitle,
  seriesUnits,
  observations,
  loading,
  period,
  onPeriodChange,
  mode,
  onModeChange,
  onClose,
}: SeriesDetailPanelProps) {
  const n = PERIODS.find((p) => p.v === period)!.n

  const chartPoints = useMemo<ChartPoint[]>(() => {
    if (!observations) return []
    const sliced = observations.slice(Math.max(0, observations.length - n))
    return sliced
      .filter((o) => o.value != null)
      .map((o) => {
        const d = new Date(o.date)
        return {
          date:      o.date,
          y:         d.getFullYear(),
          m:         d.getMonth() + 1,
          index:     o.value ?? 0,
          value:     mode === 'mom' ? o.mom : o.yoy,
          consensus: null,
        }
      })
  }, [observations, n, mode])

  return (
    <div className="nw-series-detail">
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t-label" style={{ marginBottom: 3, color: 'var(--accent)' }}>
            {seriesId}
          </div>
          <div className="t-title" style={{ fontSize: 14, lineHeight: 1.3 }}>
            {seriesTitle.length > 55 ? seriesTitle.slice(0, 55) + '…' : seriesTitle}
          </div>
          <div className="t-caption" style={{ marginTop: 2 }}>{seriesUnits}</div>
        </div>
        <button
          className="nw-btn-ghost"
          onClick={onClose}
          aria-label="닫기"
          style={{ padding: '6px 8px', flexShrink: 0 }}
        >
          <X size={14} />
        </button>
      </div>

      {/* 컨트롤 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <Segmented
          options={[...PERIODS]}
          value={period}
          onChange={(v) => onPeriodChange(v as Period)}
        />
        <Toggle
          options={[
            { v: 'mom', label: 'MoM' },
            { v: 'yoy', label: 'YoY' },
          ]}
          value={mode}
          onChange={(v) => onModeChange(v as ObsMode)}
        />
      </div>

      {/* 차트 */}
      {loading ? (
        <LineChartSkeleton h={280} />
      ) : observations === null ? (
        <div className="t-caption" style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-lo)' }}>
          시리즈를 불러오는 중...
        </div>
      ) : chartPoints.length === 0 ? (
        <div className="t-caption" style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-lo)' }}>
          선택 기간 내 데이터 없음
        </div>
      ) : (
        <LineChart
          points={chartPoints}
          height={280}
          unit="%"
          showConsensus={false}
        />
      )}

      {/* 기준 표기 */}
      {!loading && observations && observations.length > 0 && (
        <div className="t-caption" style={{ marginTop: 8, color: 'var(--text-lo)' }}>
          {mode === 'mom' ? '전월비(MoM)' : '전년동월비(YoY)'} · {seriesId} · FRED
        </div>
      )}
    </div>
  )
}
