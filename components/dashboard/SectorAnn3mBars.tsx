'use client'

import type { HeadlineKpi } from '@/lib/types'

interface SectorAnn3mBarsProps {
  items: readonly HeadlineKpi[]   // ann3m 내림차순 정렬 가정
}

function dirOf(v: number | null): 'up' | 'down' | 'flat' {
  if (v == null) return 'flat'
  return v > 0.02 ? 'up' : v < -0.02 ? 'down' : 'flat'
}

/**
 * 부문별 Annualized 3M(3M SAAR) 랭킹 — 0 기준 양/음 수평 막대.
 * 색+글리프 이중표현, tabular figures 준수. 우측에 YoY를 참조로 병기.
 */
export function SectorAnn3mBars({ items }: SectorAnn3mBarsProps) {
  const vals = items.map((i) => i.ann3m).filter((v): v is number => v != null)
  const maxAbs = (Math.max(...vals.map(Math.abs), 1)) * 1.08

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((it) => {
        const v = it.ann3m
        const d = dirOf(v)
        const pos = v != null && v >= 0
        const w = v == null ? 0 : (Math.abs(v) / maxAbs) * 50
        const glyph = d === 'up' ? '▲' : d === 'down' ? '▼' : '—'
        return (
          <div
            key={it.seriesId}
            style={{
              display: 'grid',
              gridTemplateColumns: '96px 1fr 120px',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ font: '500 13px/1.2 var(--font-sans)', color: 'var(--text-mid)' }}>
              {it.label}
            </span>
            <div style={{ position: 'relative', height: 18, display: 'flex', alignItems: 'center' }}>
              <div style={{
                position: 'absolute', left: '50%', top: -2, bottom: -2,
                width: 1, background: 'var(--border-default)',
              }} />
              <div style={{
                position: 'absolute',
                left: pos ? '50%' : `${50 - w}%`,
                width: `${w}%`,
                height: 13,
                borderRadius: 3,
                background: d === 'up' ? 'var(--up)' : d === 'down' ? 'var(--down)' : 'var(--flat)',
                opacity: 0.92,
              }} />
            </div>
            <span style={{
              display: 'inline-flex', gap: 8, justifyContent: 'flex-end', alignItems: 'baseline',
              fontFamily: 'var(--num)', fontFeatureSettings: '"tnum" 1', textAlign: 'right',
            }}>
              <span className={`nw-val-${d}`} style={{ fontWeight: 600, fontSize: 13 }}>
                {glyph} {v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%'}
              </span>
              <span className="t-caption" style={{ fontSize: 11, color: 'var(--text-lo)' }}>
                YoY {it.yoy == null ? '—' : (it.yoy > 0 ? '+' : '') + it.yoy.toFixed(1)}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
