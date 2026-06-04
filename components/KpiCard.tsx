'use client'

interface KpiCardProps {
  label: string
  sub?: string
  value: string
  unit?: string
  dir: 'up' | 'down' | 'flat'
  deltaDir?: 'up' | 'down' | 'flat'
  deltaLabel?: string
  foot?: string
  loading?: boolean
}

export function KpiCardSkeleton() {
  return (
    <div className="nw-kpi" style={{ ['--rule' as string]: 'var(--border-default)' }}>
      <div className="nw-sk" style={{ width: '45%', height: 11, borderRadius: 6 }} />
      <div className="nw-sk" style={{ width: '62%', height: 36, borderRadius: 6, margin: '16px 0 12px' }} />
      <div className="nw-sk" style={{ width: '50%', height: 12, borderRadius: 6 }} />
    </div>
  )
}

export function KpiCard({ label, sub, value, unit, dir, deltaDir, deltaLabel, foot, loading }: KpiCardProps) {
  if (loading) return <KpiCardSkeleton />

  const dd = deltaDir ?? dir
  const cls = dd === 'up' ? 'is-up' : dd === 'down' ? 'is-down' : 'is-flat'
  const tri = dd === 'up' ? '▲' : dd === 'down' ? '▼' : '—'

  return (
    <div className="nw-kpi" style={{ ['--rule' as string]: `var(--${dir})` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="t-label">{label}</span>
        {sub && <span className="t-caption" style={{ fontSize: 11 }}>{sub}</span>}
      </div>
      <div className="t-data-xl" style={{ margin: '14px 0 8px' }}>
        {value}
        {unit && <span style={{ fontSize: 22, color: 'var(--text-mid)' }}>{unit}</span>}
      </div>
      {deltaLabel && (
        <div
          className={cls}
          style={{
            fontFamily: 'var(--num)',
            fontWeight: 600,
            fontSize: 13,
            display: 'inline-flex',
            gap: 6,
            alignItems: 'center',
            fontFeatureSettings: '"tnum" 1',
          }}
        >
          <span>{tri} {deltaLabel}</span>
          <span style={{ color: 'var(--text-lo)', fontWeight: 500 }}>전월 대비</span>
        </div>
      )}
      {foot && <div className="t-caption" style={{ marginTop: 8 }}>{foot}</div>}
    </div>
  )
}

interface InfoCardProps {
  label: string
  value: string
  foot?: string
  loading?: boolean
}

export function InfoCard({ label, value, foot, loading }: InfoCardProps) {
  if (loading) return <KpiCardSkeleton />

  return (
    <div className="nw-kpi" style={{ ['--rule' as string]: 'var(--accent-line)' }}>
      <span className="t-label">{label}</span>
      <div className="t-data-lg" style={{ margin: '14px 0 8px', fontSize: 28 }}>{value}</div>
      {foot && <div className="t-caption" style={{ marginTop: 6 }}>{foot}</div>}
    </div>
  )
}
