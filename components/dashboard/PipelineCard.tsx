'use client'

import { Fragment } from 'react'
import type { PipelinePanel } from '@/lib/types'

const fmt = (v: number | null, d = 1): string => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(d))
const dirOf = (v: number | null): 'up' | 'down' | 'flat' =>
  v == null ? 'flat' : v > 0.02 ? 'up' : v < -0.02 ? 'down' : 'flat'
const glyphOf = (d: 'up' | 'down' | 'flat'): string => (d === 'up' ? '▲' : d === 'down' ? '▼' : '—')

interface PipelineCardProps {
  data: PipelinePanel
}

/**
 * 파이프라인 패스스루 — 미가공→가공→최종수요 물가 전이(전 단계 SA, WPSID 체계).
 * 상류 가속·하류 평온이면 수개월 뒤 헤드라인 상승 선행신호로 읽는다.
 * 종합(read)은 상류 평균 3M연율 − 하류 3M연율 갭 기준(±0.5%p)의 결정적 판정.
 */
export function PipelineCard({ data }: PipelineCardProps) {
  const readLabel =
    data.read === 'building' ? '압력 누적' : data.read === 'easing' ? '압력 완화' : data.read === 'mixed' ? '혼조' : '—'
  const readDir = data.read === 'building' ? 'up' : data.read === 'easing' ? 'down' : 'flat'

  return (
    <div>
      {/* 종합 방향 뱃지 */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="t-label">파이프라인 압력</span>
        <span className={`nw-val-${readDir}`} style={{ fontWeight: 700, fontSize: 15 }}>
          {glyphOf(readDir)} {readLabel}
        </span>
        <span className="t-caption" style={{ color: 'var(--text-lo)' }}>상류 vs 하류 · 3M 연율 갭 기준</span>
      </div>

      {/* 단계 흐름: 미가공 → 가공 → 최종수요 */}
      <div className="nw-pipeline">
        {data.stages.map((st, i) => {
          const d = dirOf(st.ann3m)
          return (
            <Fragment key={st.seriesId}>
              {i > 0 && <span className="nw-pipeline-arrow" aria-hidden="true" />}
              <div className="nw-pipeline-stage">
                <span style={{ font: '500 13px/1.2 var(--font-sans)', color: 'var(--text-mid)' }}>
                  {st.label}
                </span>
                <span
                  className={`nw-val-${d}`}
                  style={{ fontWeight: 700, fontSize: 18, fontFamily: 'var(--num)', fontFeatureSettings: '"tnum" 1' }}
                >
                  {glyphOf(d)} {fmt(st.ann3m)}%
                </span>
                <span
                  className="t-caption"
                  style={{ color: 'var(--text-lo)', fontFamily: 'var(--num)', fontFeatureSettings: '"tnum" 1' }}
                >
                  YoY {fmt(st.yoy)} · MoM {fmt(st.mom, 2)}
                </span>
              </div>
            </Fragment>
          )
        })}
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
        <span className="t-caption" style={{ color: 'var(--text-lo)' }}>
          전 단계 SA · 주지표 3M 연율(SAAR) · 상류 가속은 수개월 후 하류로 전이되는 경향(선행신호이며 예측 아님)
        </span>
      </div>
    </div>
  )
}
