'use client'

/** 히트맵 한 줄 — 라벨 + 월별 MoM 셀. 대시보드 쿼리 결과(DashboardHeatRow)와 동일 형태. */
export interface HeatmapRow {
  label: string
  cells: Array<{ date: string; mom: number | null }>
}

interface HeatmapProps {
  rows: HeatmapRow[]
  months: Array<{ y: number; m: number; date: string }>
}

export function Heatmap({ rows, months }: HeatmapProps) {
  const all = rows.flatMap((r) => r.cells.map((c) => c.mom)).filter((v): v is number => v != null)
  const maxAbs = Math.max(...all.map(Math.abs)) || 1

  const cellBg = (v: number | null): string => {
    if (v == null) return 'transparent'
    const a = Math.min(0.42, 0.10 + (Math.abs(v) / maxAbs) * 0.34)
    return v >= 0 ? `rgba(244,113,94,${a})` : `rgba(84,166,214,${a})`
  }

  const cellFg = (v: number | null): string => {
    if (v == null) return 'var(--text-lo)'
    const strong = Math.abs(v) / maxAbs > 0.55
    return strong ? '#fff' : v >= 0 ? 'var(--up)' : 'var(--down)'
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 4, width: '100%', minWidth: 520 }}>
        <thead>
          <tr>
            <th />
            {months.map((m, i) => (
              <th
                key={i}
                style={{
                  font: '600 10px/1 var(--font-sans)',
                  letterSpacing: '.04em',
                  color: 'var(--text-lo)',
                  textTransform: 'uppercase',
                  padding: '0 0 6px',
                  textAlign: 'center',
                }}
              >
                {String(m.y).slice(2)}.{String(m.m).padStart(2, '0')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td style={{
                font: '500 12.5px/1 var(--font-sans)',
                color: 'var(--text-mid)',
                whiteSpace: 'nowrap',
                paddingRight: 10,
              }}>
                {r.label}
              </td>
              {r.cells.map((c, i) => (
                <td
                  key={i}
                  style={{
                    fontFamily: 'var(--num)',
                    fontWeight: 600,
                    fontSize: 12,
                    textAlign: 'center',
                    padding: '9px 4px',
                    borderRadius: 6,
                    background: cellBg(c.mom),
                    color: cellFg(c.mom),
                    fontFeatureSettings: '"tnum" 1',
                  }}
                >
                  {c.mom == null ? '–' : (c.mom > 0 ? '+' : '') + c.mom.toFixed(1)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
