'use client'

import type { PcePipeline } from '@/lib/types'

const fmt = (v: number | null, d = 1): string => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(d))
const dirOf = (v: number | null): 'up' | 'down' | 'flat' =>
  v == null ? 'flat' : v > 0.02 ? 'up' : v < -0.02 ? 'down' : 'flat'
const glyphOf = (d: 'up' | 'down' | 'flat'): string => (d === 'up' ? '▲' : d === 'down' ? '▼' : '—')

interface PcePipelineCardProps {
  data: PcePipeline
}

/**
 * PPI→PCE 파이프라인 — 코어 PCE에 반영되는 PPI 라인 + 압력 방향(가중합 아님).
 * 라인별 3M 연율·MoM·YoY를 보여주고 상단에 종합 방향을 뱃지로 표기.
 */
export function PcePipelineCard({ data }: PcePipelineCardProps) {
  const readLabel =
    data.read === 'firming' ? '강화' : data.read === 'softening' ? '완화' : data.read === 'mixed' ? '혼조' : '—'
  const readDir = data.read === 'firming' ? 'up' : data.read === 'softening' ? 'down' : 'flat'

  return (
    <div>
      {/* 종합 방향 뱃지 */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="t-label">코어 PCE 압력</span>
        <span className={`nw-val-${readDir}`} style={{ fontWeight: 700, fontSize: 15 }}>
          {glyphOf(readDir)} {readLabel}
        </span>
        <span className="t-caption" style={{ color: 'var(--text-lo)' }}>3M 연율 방향 종합</span>
      </div>

      {/* 라인별 지표 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {data.items.map((it) => {
          const d = dirOf(it.ann3m)
          return (
            <div
              key={it.seriesId}
              style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'baseline', gap: 12 }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ font: '500 13px/1.2 var(--font-sans)', color: 'var(--text-mid)' }}>{it.label}</span>
                <span className="t-caption" style={{ marginLeft: 8, color: 'var(--text-lo)' }}>{it.group}</span>
              </span>
              <span style={{ display: 'inline-flex', gap: 10, justifyContent: 'flex-end', alignItems: 'baseline', fontFamily: 'var(--num)', fontFeatureSettings: '"tnum" 1' }}>
                <span className={`nw-val-${d}`} style={{ fontWeight: 600, fontSize: 13 }}>
                  {glyphOf(d)} 3M {fmt(it.ann3m)}%
                </span>
                <span className="t-caption" style={{ fontSize: 11, color: 'var(--text-lo)' }}>
                  MoM {fmt(it.mom, 2)} · YoY {fmt(it.yoy)}
                </span>
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
        <span className="t-caption" style={{ color: 'var(--text-lo)' }}>
          BEA 코어 PCE 반영 PPI 라인(의료·금융·항공) · NSA(계절성 포함) · 방향 신호(정밀 PCE 수치 아님)
        </span>
      </div>
    </div>
  )
}
