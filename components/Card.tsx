'use client'

import { type ReactNode } from 'react'

interface CardProps {
  title?: string
  eyebrow?: string
  right?: ReactNode
  children: ReactNode
  style?: React.CSSProperties
}

export function Card({ title, eyebrow, right, children, style }: CardProps) {
  return (
    <section className="nw-card" style={style}>
      {(title || right) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 18,
            flexWrap: 'wrap',
          }}
        >
          <div>
            {eyebrow && <div className="t-label" style={{ marginBottom: 6 }}>{eyebrow}</div>}
            {title && <h3 className="t-h3">{title}</h3>}
          </div>
          {right && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {right}
            </div>
          )}
        </div>
      )}
      {children}
    </section>
  )
}

// Legend dot / line / ring helper
interface LegendProps {
  color: string
  label: string
  line?: boolean
  ring?: boolean
}

export function Legend({ color, label, line, ring }: LegendProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      {line ? (
        <span style={{ width: 16, height: 2, background: color, borderRadius: 2 }} />
      ) : ring ? (
        <span style={{
          width: 9, height: 9, borderRadius: '50%',
          border: `1.5px solid ${color}`, background: 'var(--bg-1)',
        }} />
      ) : (
        <span style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
      )}
      <span className="t-caption">{label}</span>
    </span>
  )
}
