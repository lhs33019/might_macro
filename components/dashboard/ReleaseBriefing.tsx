'use client'

import type { ReactNode } from 'react'
import type { ReleaseBriefing as Briefing } from '@/lib/types'

type Dir = 'up' | 'down' | 'flat'
const glyphOf = (d: Dir): string => (d === 'up' ? '▲' : d === 'down' ? '▼' : '—')

interface BriefingProps {
  data: Briefing
  refMonth: string
}

function Tile({ label, dir, value, sub }: { label: string; dir: Dir; value: ReactNode; sub?: string }) {
  return (
    <div style={{ flex: '1 1 150px', minWidth: 140, padding: '0 16px', borderLeft: '1px solid var(--border-subtle)' }}>
      <div className="t-label" style={{ marginBottom: 5 }}>{label}</div>
      <div
        className={`nw-val-${dir}`}
        style={{ fontFamily: 'var(--num)', fontFeatureSettings: '"tnum" 1', fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}
      >
        {value}
      </div>
      {sub && <div className="t-caption" style={{ marginTop: 3, color: 'var(--text-lo)' }}>{sub}</div>}
    </div>
  )
}

/**
 * 발표일 브리핑 — 신규 지표(서프라이즈·가속·폭·PCE·마진)를 결정적으로 종합한 한눈 요약.
 * "손쉬운 인사이트 획득"의 랜딩. AI 한줄평이 없어도 단독으로 동작.
 */
export function ReleaseBriefing({ data, refMonth }: BriefingProps) {
  const surpriseNet = data.surpriseBeats - data.surpriseMisses
  const surpriseDir: Dir = data.surpriseTotal === 0 ? 'flat' : surpriseNet > 0 ? 'up' : surpriseNet < 0 ? 'down' : 'flat'

  const accelDir: Dir = data.topAccelValue == null ? 'flat' : data.topAccelValue > 0.02 ? 'up' : data.topAccelValue < -0.02 ? 'down' : 'flat'
  const breadthDir: Dir = data.breadthPct == null ? 'flat' : data.breadthPct > 50 ? 'up' : data.breadthPct < 50 ? 'down' : 'flat'

  const pceDir: Dir = data.pceRead === 'firming' ? 'up' : data.pceRead === 'softening' ? 'down' : 'flat'
  const pceLabel = data.pceRead === 'firming' ? '강화' : data.pceRead === 'softening' ? '완화' : data.pceRead === 'mixed' ? '혼조' : '—'

  const marginDir: Dir = data.marginRead === 'squeeze' ? 'up' : data.marginRead === 'relief' ? 'down' : 'flat'
  const marginLabel = data.marginRead === 'squeeze' ? '압박' : data.marginRead === 'relief' ? '여력' : data.marginRead === 'neutral' ? '중립' : '—'

  return (
    <div className="nw-card" style={{ padding: '14px 4px 16px 18px', marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 12, paddingRight: 14, flexWrap: 'wrap' }}>
        <span className="t-label" style={{ color: 'var(--accent)' }}>발표일 브리핑</span>
        <span className="t-caption" style={{ color: 'var(--text-lo)' }}>{refMonth} 기준 · 지표 결정적 종합</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: 14 }}>
        <Tile
          label="컨센서스"
          dir={surpriseDir}
          value={data.surpriseTotal === 0 ? '—' : `${glyphOf(surpriseDir)} ${data.surpriseBeats}↑ / ${data.surpriseMisses}↓`}
          sub={data.surpriseTotal === 0 ? '입력 없음' : `${data.surpriseTotal}개 비교`}
        />
        <Tile
          label="최고 가속 부문"
          dir={accelDir}
          value={data.topAccelLabel ?? '—'}
          sub={data.topAccelValue == null ? undefined : `실질가속 ${(data.topAccelValue >= 0 ? '+' : '') + data.topAccelValue.toFixed(1)}%p`}
        />
        <Tile
          label="가격 상승 폭"
          dir={breadthDir}
          value={data.breadthPct == null ? '—' : `${data.breadthPct.toFixed(0)}%`}
          sub="MoM 상승 비중"
        />
        <Tile label="코어 PCE 압력" dir={pceDir} value={`${glyphOf(pceDir)} ${pceLabel}`} sub="PPI 반영 라인" />
        <Tile label="마진(PPI−CPI)" dir={marginDir} value={`${glyphOf(marginDir)} ${marginLabel}`} sub="헤드라인 갭" />
      </div>
    </div>
  )
}
