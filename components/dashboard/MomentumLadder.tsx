'use client'

import type { MomentumRow } from '@/lib/types'

const fmt = (v: number | null, d = 1): string => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(d))
const cls = (v: number | null): string =>
  v == null ? 'nw-val-flat' : v > 0.02 ? 'nw-val-up' : v < -0.02 ? 'nw-val-down' : 'nw-val-flat'

interface MomentumLadderProps {
  rows: readonly MomentumRow[]
}

/**
 * 인플레이션 모멘텀 래더 — 헤드라인별 1M/3M/6M 연율 + YoY를 나란히 보여
 * 단기→장기 모멘텀의 가속/둔화를 한눈에. 캐리오버는 "다음달 MoM=0이면 YoY"(베이스효과 프리뷰).
 */
export function MomentumLadder({ rows }: MomentumLadderProps) {
  const numCell: React.CSSProperties = { textAlign: 'right', fontSize: 12.5, fontWeight: 600, padding: '5px 0' }
  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--num)', fontFeatureSettings: '"tnum" 1' }}>
        <thead>
          <tr>
            <th className="t-label" style={{ textAlign: 'left', padding: '0 0 8px', fontWeight: 600 }}>부문</th>
            <th className="t-label" style={{ textAlign: 'right', padding: '0 0 8px', fontWeight: 600 }}>1M</th>
            <th className="t-label" style={{ textAlign: 'right', padding: '0 0 8px', fontWeight: 600 }}>3M</th>
            <th className="t-label" style={{ textAlign: 'right', padding: '0 0 8px', fontWeight: 600 }}>6M</th>
            <th className="t-label" style={{ textAlign: 'right', padding: '0 0 8px', fontWeight: 600 }}>YoY</th>
            <th className="t-label" style={{ textAlign: 'right', padding: '0 0 8px 14px', fontWeight: 600 }}>캐리오버</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.seriesId} style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <td style={{ font: '500 12.5px/1.2 var(--font-sans)', color: 'var(--text-mid)', padding: '5px 0', whiteSpace: 'nowrap' }}>
                {r.label}
              </td>
              <td className={cls(r.ann1m)} style={numCell}>{fmt(r.ann1m)}</td>
              <td className={cls(r.ann3m)} style={numCell}>{fmt(r.ann3m)}</td>
              <td className={cls(r.ann6m)} style={numCell}>{fmt(r.ann6m)}</td>
              <td className={cls(r.yoy)} style={numCell}>{fmt(r.yoy)}</td>
              <td className={cls(r.carryover)} style={{ ...numCell, paddingLeft: 14 }}>{fmt(r.carryover)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
        <span className="t-caption" style={{ color: 'var(--text-lo)' }}>
          1M/3M/6M = 연율(SAAR, %) · YoY = 전년동월비 · 캐리오버 = 다음달 MoM=0일 때의 YoY(베이스효과) · NSA 계열은 계절성 주의
        </span>
      </div>
    </div>
  )
}
