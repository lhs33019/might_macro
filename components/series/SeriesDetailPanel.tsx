'use client'

import { useMemo } from 'react'
import { X } from 'lucide-react'
import { LineChart, LineChartSkeleton, type ChartPoint } from '@/components/charts/LineChart'
import { Segmented, Toggle } from '@/components/controls'
import { TagChips } from './TagChips'
import type { ObservationItem, SeriesTag } from '@/lib/types'

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
  // 추세 인사이트 (목록에서 사전 계산된 값 전달)
  tags: readonly SeriesTag[]
  latestYoy: number | null
  deltaYoy: number | null
  yoyMin10y: number | null
  yoyMax10y: number | null
  ann3m: number | null
  accel3m: number | null
}

function fmtPct(v: number | null): string {
  if (v == null) return '—'
  return (v > 0 ? '+' : '') + v.toFixed(2) + '%'
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
  tags,
  latestYoy,
  deltaYoy,
  yoyMin10y,
  yoyMax10y,
  ann3m,
  accel3m,
}: SeriesDetailPanelProps) {
  const n = PERIODS.find((p) => p.v === period)!.n

  // 가속도(ΔYoY) 방향 글리프
  const accelDir = deltaYoy == null ? 'flat' : deltaYoy > 0.02 ? 'up' : deltaYoy < -0.02 ? 'down' : 'flat'
  const accelGlyph = accelDir === 'up' ? '▲' : accelDir === 'down' ? '▼' : '—'

  // 실질 가속도(accel3m = ann3m − yoy) 방향 글리프
  const realDir = accel3m == null ? 'flat' : accel3m > 0.02 ? 'up' : accel3m < -0.02 ? 'down' : 'flat'
  const realGlyph = realDir === 'up' ? '▲' : realDir === 'down' ? '▼' : '—'

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
          <div className="t-title" style={{ fontSize: 14, lineHeight: 1.3, wordBreak: 'break-word' }}>
            {seriesTitle}
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

      {/* 트렌드 요약 — 태그 + ΔYoY + 10년 범위 (최근 10년 윈도우 기준) */}
      <div className="nw-trend-summary">
        <div style={{ marginBottom: 10 }}>
          <TagChips tags={tags} />
        </div>
        <div className="nw-trend-stats">
          <div>
            <div className="t-label">최신 YoY</div>
            <div className="nw-trend-num">{fmtPct(latestYoy)}</div>
          </div>
          <div>
            <div className="t-label">Annualized 3M</div>
            <div className={`nw-trend-num nw-val-${ann3m == null ? 'flat' : ann3m > 0.02 ? 'up' : ann3m < -0.02 ? 'down' : 'flat'}`}>
              {fmtPct(ann3m)}
            </div>
          </div>
          <div>
            <div className="t-label">실질가속도 3M−YoY</div>
            <div className={`nw-trend-num nw-val-${realDir}`}>
              {realGlyph} {accel3m == null ? '—' : (accel3m > 0 ? '+' : '') + accel3m.toFixed(2) + '%p'}
            </div>
          </div>
          <div>
            <div className="t-label">가속도 ΔYoY·3M</div>
            <div className={`nw-trend-num nw-val-${accelDir}`}>
              {accelGlyph} {deltaYoy == null ? '—' : (deltaYoy > 0 ? '+' : '') + deltaYoy.toFixed(2) + '%p'}
            </div>
          </div>
          <div>
            <div className="t-label">10년 YoY 범위</div>
            <div className="nw-trend-num" style={{ fontSize: 12 }}>
              {fmtPct(yoyMin10y)} ~ {fmtPct(yoyMax10y)}
            </div>
          </div>
        </div>
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
