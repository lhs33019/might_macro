'use client'

import type { TopMover } from '@/lib/types'

interface TopMoversTableProps {
  title: string
  rows: readonly TopMover[]
  metric: 'mom' | 'yoy' | 'pctile'
}

function fmtVal(v: number, metric: TopMoversTableProps['metric']): string {
  // pctile은 변화율이 아닌 분포 위치(0~100) — P 접두, 부호·% 없음
  if (metric === 'pctile') return `P${v.toFixed(0)}`
  return (v > 0 ? '+' : '') + v.toFixed(2) + '%'
}

function ValCell({ value, direction, metric }: {
  value: number; direction: TopMover['direction']; metric: TopMoversTableProps['metric']
}) {
  const cls = `nw-val-${direction}`
  const glyph = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '—'
  return (
    <span className={cls} style={{ whiteSpace: 'nowrap' }}>
      {glyph} {fmtVal(value, metric)}
    </span>
  )
}

export function TopMoversTable({ title, rows, metric }: TopMoversTableProps) {
  return (
    <div className="nw-card" style={{ padding: '16px 18px' }}>
      <div className="t-label" style={{ marginBottom: 10 }}>{title}</div>
      {rows.length === 0 ? (
        <div className="t-caption" style={{ padding: '12px 0', color: 'var(--text-lo)' }}>
          데이터 없음
        </div>
      ) : (
        <table className="nw-mover-table">
          <thead>
            <tr>
              <th style={{ width: '45%' }}>시리즈</th>
              <th style={{ width: '35%', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>이름</th>
              <th style={{ width: '20%', textAlign: 'right' }}>값</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.seriesId}>
                <td>
                  <span style={{
                    fontFamily: 'var(--num)',
                    fontWeight: 600,
                    fontSize: 12,
                    color: 'var(--text-hi)',
                  }}>
                    {r.seriesId}
                  </span>
                </td>
                <td style={{
                  maxWidth: 130,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  color: 'var(--text-lo)',
                  fontSize: 11,
                }}>
                  {r.title.length > 28 ? r.title.slice(0, 28) + '…' : r.title}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <ValCell value={r.value} direction={r.direction} metric={metric} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
