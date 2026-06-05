'use client'

import { Sparkles } from 'lucide-react'
import type { DashboardInsight } from '@/lib/types'

interface InsightBannerProps {
  insight: DashboardInsight | null
}

/**
 * AI 발표 해석 한줄평 배너. ingest 시점에 생성·DB 저장된 문장만 표시(외부 호출 없음).
 * 값이 없으면 안내 문구 표시.
 */
export function InsightBanner({ insight }: InsightBannerProps) {
  return (
    <div className="nw-insight">
      <div className="nw-insight-icon" aria-hidden>
        <Sparkles size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t-label nw-insight-eyebrow">AI 인사이트 · 한줄평</div>
        {insight ? (
          <>
            <p className="nw-insight-body">{insight.body}</p>
            <div className="t-caption nw-insight-meta">
              {insight.model} · 기준월 {insight.refDate?.slice(0, 7).replace('-', '.')}
              {' · '}
              생성 {insight.generatedAt?.slice(0, 10).replace(/-/g, '.')}
            </div>
          </>
        ) : (
          <p className="nw-insight-body" style={{ color: 'var(--text-lo)' }}>
            아직 생성된 한줄평이 없습니다. 데이터 적재 시 자동 생성됩니다.
          </p>
        )}
      </div>
    </div>
  )
}
