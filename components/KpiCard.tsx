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
  // 시장 컨센서스 대비 서프라이즈 (있을 때만 표시, 출처 함께 노출)
  surprise?: number | null
  consensusYoy?: number | null
  consensusSource?: string | null
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

export function KpiCard({
  label, sub, value, unit, dir, deltaDir, deltaLabel, foot, loading,
  surprise, consensusYoy, consensusSource,
}: KpiCardProps) {
  if (loading) return <KpiCardSkeleton />

  const dd = deltaDir ?? dir
  const cls = dd === 'up' ? 'is-up' : dd === 'down' ? 'is-down' : 'is-flat'
  const tri = dd === 'up' ? '▲' : dd === 'down' ? '▼' : '—'

  // 서프라이즈 (실측 YoY − 컨센서스): 양수=예상 상회, 음수=예상 하회
  const hasSurprise = surprise != null
  const sCls = !hasSurprise ? 'is-flat' : surprise > 0.02 ? 'is-up' : surprise < -0.02 ? 'is-down' : 'is-flat'
  const sTri = !hasSurprise ? '—' : surprise > 0.02 ? '▲' : surprise < -0.02 ? '▼' : '—'

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
      {hasSurprise && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'baseline' }}>
          <span
            className={sCls}
            style={{
              fontFamily: 'var(--num)', fontWeight: 600, fontSize: 12.5,
              fontFeatureSettings: '"tnum" 1',
            }}
          >
            서프 {sTri} {(surprise! >= 0 ? '+' : '') + surprise!.toFixed(1)}%p
          </span>
          <span className="t-caption" style={{ color: 'var(--text-lo)' }}>
            vs 컨센 {consensusYoy != null ? consensusYoy.toFixed(1) : '–'}%
            {consensusSource ? ` · ${consensusSource}` : ''}
          </span>
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
