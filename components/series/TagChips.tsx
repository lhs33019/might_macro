'use client'

import type { SeriesTag } from '@/lib/types'

/** 태그 → 색 톤 매핑 (색맹 대비: 색 + 텍스트로 이중 표현) */
export function tagTone(tag: SeriesTag): 'up' | 'down' | 'accent' | 'flat' {
  if (tag.startsWith('상승') || tag === '10년최고') return 'up'
  if (tag.startsWith('하락') || tag === '10년최저') return 'down'
  if (tag === '추세반전') return 'accent'
  return 'flat' // 횡보
}

interface TagChipsProps {
  tags: readonly SeriesTag[]
  max?: number   // 표시 개수 제한 (초과분은 +N)
}

/** 시리즈 특징 태그 칩 묶음 — 표·상세 패널 공용 */
export function TagChips({ tags, max }: TagChipsProps) {
  if (tags.length === 0) {
    return <span className="t-caption" style={{ color: 'var(--text-lo)' }}>—</span>
  }
  const shown = max ? tags.slice(0, max) : tags
  const rest = max ? tags.length - shown.length : 0
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
      {shown.map((t) => (
        <span key={t} className={`nw-tag nw-tag--${tagTone(t)}`}>#{t}</span>
      ))}
      {rest > 0 && <span className="nw-tag nw-tag--flat">+{rest}</span>}
    </span>
  )
}
