'use client'

import type { MarginSpread } from '@/lib/types'

const fmt = (v: number | null, d = 1): string => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(d))
const dirOf = (v: number | null): 'up' | 'down' | 'flat' =>
  v == null ? 'flat' : v > 0.02 ? 'up' : v < -0.02 ? 'down' : 'flat'
const glyphOf = (d: 'up' | 'down' | 'flat'): string => (d === 'up' ? '▲' : d === 'down' ? '▼' : '—')

function readOf(gap: number | null): string {
  if (gap == null) return '—'
  if (gap > 0.3) return '마진 압박'
  if (gap < -0.3) return '마진 여력'
  return '중립'
}

interface MarginSpreadCardProps {
  data: MarginSpread
}

/**
 * PPI−CPI 마진 스프레드 — 투입가(PPI) vs 산출가(CPI) YoY 갭(%p).
 * 양수=PPI가 CPI 추월 → 마진 압박. 음수=CPI 우위 → 가격 전가력/마진 여력.
 * 계열 일치를 위해 양쪽 모두 SA.
 */
export function MarginSpreadCard({ data }: MarginSpreadCardProps) {
  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--num)', fontFeatureSettings: '"tnum" 1' }}>
        <thead>
          <tr style={{ textAlign: 'right' }}>
            <th style={{ textAlign: 'left' }} />
            <th className="t-label" style={{ padding: '0 0 8px', fontWeight: 600 }}>PPI YoY</th>
            <th className="t-label" style={{ padding: '0 0 8px', fontWeight: 600 }}>CPI YoY</th>
            <th className="t-label" style={{ padding: '0 0 8px', fontWeight: 600 }}>갭(%p)</th>
            <th className="t-label" style={{ padding: '0 0 8px 14px', fontWeight: 600 }}>해석</th>
          </tr>
        </thead>
        <tbody>
          {data.pairs.map((p) => {
            const d = dirOf(p.gap)
            return (
              <tr key={p.key}>
                <td style={{ font: '600 13px/1.6 var(--font-sans)', color: 'var(--text-mid)', textAlign: 'left' }}>
                  {p.label}
                </td>
                <td style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-hi)' }}>{fmt(p.ppiYoy)}%</td>
                <td style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-hi)' }}>{fmt(p.cpiYoy)}%</td>
                <td className={`nw-val-${d}`} style={{ textAlign: 'right', fontSize: 13, fontWeight: 600 }}>
                  {glyphOf(d)} {fmt(p.gap)}
                </td>
                <td className="t-caption" style={{ textAlign: 'right', paddingLeft: 14, color: 'var(--text-mid)' }}>
                  {readOf(p.gap)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
        <span className="t-caption" style={{ color: 'var(--text-lo)' }}>
          갭 = PPI YoY − CPI YoY · 양수(▲)=투입가 우위·마진 압박 / 음수(▼)=가격 전가력·여력 · 양쪽 SA 계열
        </span>
      </div>
    </div>
  )
}
