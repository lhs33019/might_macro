'use client'

import { type ContributionItem } from '@/lib/data/dummy'

interface ContributionBarsProps {
  items: ContributionItem[]
}

export function ContributionBars({ items }: ContributionBarsProps) {
  const maxAbs = Math.max(...items.map((i) => Math.abs(i.value))) * 1.1 || 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((it) => {
        const pos = it.value >= 0
        const w = (Math.abs(it.value) / maxAbs) * 50
        return (
          <div
            key={it.key}
            style={{
              display: 'grid',
              gridTemplateColumns: '78px 1fr 56px',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--text-mid)' }}>
              {it.label}
            </span>
            <div style={{ position: 'relative', height: 18, display: 'flex', alignItems: 'center' }}>
              <div style={{
                position: 'absolute',
                left: '50%',
                top: -2,
                bottom: -2,
                width: 1,
                background: 'var(--border-default)',
              }} />
              <div style={{
                position: 'absolute',
                left: pos ? '50%' : `${50 - w}%`,
                width: `${w}%`,
                height: 13,
                borderRadius: 3,
                background: pos ? 'var(--up)' : 'var(--down)',
                opacity: 0.92,
              }} />
            </div>
            <span style={{
              fontFamily: 'var(--num)',
              fontWeight: 600,
              fontSize: 13,
              textAlign: 'right',
              fontFeatureSettings: '"tnum" 1',
              color: pos ? 'var(--up)' : 'var(--down)',
            }}>
              {pos ? '+' : ''}{it.value.toFixed(2)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
