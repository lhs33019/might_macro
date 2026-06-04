'use client'

import { useState, useRef, useLayoutEffect, useMemo, useCallback, useId } from 'react'
import { type DataPoint } from '@/lib/data/dummy'

interface ChartPoint {
  date: string
  y: number
  m: number
  index: number
  value: number | null
  consensus: number | null
}

interface LineChartProps {
  points: ChartPoint[]
  height?: number
  showConsensus?: boolean
  unit?: string
  isMobile?: boolean
}

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min || 1
  const step0 = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(step0)))
  const norm = step0 / mag
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag
  const start = Math.ceil(min / step) * step
  const out: number[] = []
  for (let v = start; v <= max + 1e-9; v += step) out.push(+v.toFixed(6))
  return out
}

export function LineChartSkeleton({ h = 320 }: { h?: number }) {
  return (
    <div>
      <div className="nw-sk" style={{ width: '38%', height: 12, borderRadius: 6, marginBottom: 20 }} />
      <div className="nw-sk" style={{ width: '100%', height: h, borderRadius: 10 }} />
    </div>
  )
}

export function LineChart({
  points,
  height = 340,
  showConsensus = false,
  unit = '%',
  isMobile = false,
}: LineChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(720)
  const [hover, setHover] = useState<number | null>(null)
  const gid = useId().replace(/:/g, '')

  useLayoutEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0].contentRect.width
      if (cw) setW(cw)
    })
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  const padL = 46, padR = 16, padT = 18, padB = 28
  const H = isMobile ? 240 : height
  const innerW = Math.max(40, W - padL - padR)
  const innerH = H - padT - padB

  const vals = points.map((p) => p.value).filter((v): v is number => v != null)
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals)
  const pad = (hi - lo) * 0.12 || 1
  lo -= pad; hi += pad
  const yTicks = niceTicks(lo, hi, 4)

  const x = (i: number) =>
    padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * innerH
  const y0 = y(0)

  const linePath = useMemo(() => {
    let d = '', started = false
    points.forEach((p, i) => {
      if (p.value == null) return
      d += (started ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.value).toFixed(1) + ' '
      started = true
    })
    return d.trim()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, W, H])

  const areaPath = useMemo(() => {
    const pts: Array<[number, number]> = []
    points.forEach((p, i) => { if (p.value != null) pts.push([i, p.value]) })
    if (!pts.length) return ''
    let d = `M ${x(pts[0][0]).toFixed(1)} ${y0.toFixed(1)} `
    pts.forEach(([i, v]) => { d += `L ${x(i).toFixed(1)} ${y(v).toFixed(1)} ` })
    d += `L ${x(pts[pts.length - 1][0]).toFixed(1)} ${y0.toFixed(1)} Z`
    return d
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, W, H])

  const lastVal = [...points].reverse().find((p) => p.value != null)?.value ?? 0
  const dir = lastVal > 0.02 ? 'up' : lastVal < -0.02 ? 'down' : 'flat'
  const dirColor = `var(--${dir})`

  const labelEvery = Math.ceil(points.length / (isMobile ? 4 : 7))
  const xLabels = points
    .map((p, i) => ({ i, p }))
    .filter(({ i }) => i % labelEvery === 0 || i === points.length - 1)
  const fmtX = (p: ChartPoint) =>
    points.length > 30
      ? `${String(p.y).slice(2)}.${String(p.m).padStart(2, '0')}`
      : `${p.m}월`

  const onMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
      const cx =
        ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left
      const rel = (cx - padL) / innerW
      let idx = Math.round(rel * (points.length - 1))
      idx = Math.max(0, Math.min(points.length - 1, idx))
      setHover(idx)
    },
    [points.length, innerW]
  )

  const hp = hover != null ? points[hover] : null
  const tipLeft = hover != null ? Math.min(Math.max(x(hover), padL + 4), W - 4) : 0
  const tipFlip = tipLeft > W * 0.62

  // index of last non-null point
  const lastIdx = (() => {
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].value != null) return i
    }
    return -1
  })()

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', userSelect: 'none' }}>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={onMove}
        onTouchMove={onMove}
        style={{ display: 'block', touchAction: 'pan-y' }}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={dirColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={dirColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* y gridlines + labels */}
        {yTicks.map((t, k) => (
          <g key={k}>
            <line
              x1={padL} x2={W - padR} y1={y(t)} y2={y(t)}
              stroke={Math.abs(t) < 1e-9 ? 'var(--border-default)' : 'var(--grid-line)'}
              strokeWidth="1"
              strokeDasharray={Math.abs(t) < 1e-9 ? '4 4' : ''}
            />
            <text
              x={padL - 8} y={y(t) + 4}
              textAnchor="end"
              fontFamily="var(--font-mono)"
              fontSize="10.5"
              fill="var(--axis-text)"
            >
              {t > 0 ? '+' : ''}{t.toFixed(1)}{unit}
            </text>
          </g>
        ))}

        {/* x labels */}
        {xLabels.map(({ i, p }) => (
          <text
            key={i} x={x(i)} y={H - 8}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="10.5"
            fill="var(--axis-text)"
          >
            {fmtX(p)}
          </text>
        ))}

        {/* area + line */}
        <path d={areaPath} fill={`url(#${gid})`} />
        <path
          d={linePath} fill="none"
          stroke="var(--accent)" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round"
        />

        {/* consensus markers */}
        {showConsensus && points.map((p, i) =>
          p.consensus != null && p.value != null ? (
            <circle
              key={i} cx={x(i)} cy={y(p.consensus)} r="3"
              fill="var(--bg-1)" stroke="var(--flat)" strokeWidth="1.5"
            />
          ) : null
        )}

        {/* last point dot */}
        {lastIdx >= 0 && points[lastIdx].value != null && (
          <circle
            cx={x(lastIdx)} cy={y(points[lastIdx].value!)} r="3.5"
            fill={dirColor} stroke="var(--bg-1)" strokeWidth="2"
          />
        )}

        {/* hover crosshair */}
        {hp && hp.value != null && (
          <g>
            <line
              x1={x(hover!)} x2={x(hover!)} y1={padT} y2={H - padB}
              stroke="var(--border-strong)" strokeWidth="1"
            />
            <circle
              cx={x(hover!)} cy={y(hp.value)} r="4.5"
              fill="var(--accent)" stroke="var(--bg-1)" strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {/* tooltip */}
      {hp && hp.value != null && (
        <div
          style={{
            position: 'absolute',
            top: padT,
            left: tipLeft,
            transform: `translateX(${tipFlip ? '-100%' : '0'}) translateX(${tipFlip ? -10 : 10}px)`,
            background: 'color-mix(in srgb, var(--surface-3) 96%, transparent)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--r-md)',
            padding: '10px 12px',
            boxShadow: 'var(--shadow-lg)',
            backdropFilter: 'blur(8px)',
            pointerEvents: 'none',
            minWidth: 150,
            zIndex: 5,
          }}
        >
          <div className="t-label" style={{ marginBottom: 8 }}>
            {hp.y}년 {hp.m}월
          </div>
          <TooltipRow
            dot={dirColor}
            k="변동률"
            v={`${hp.value > 0 ? '+' : ''}${hp.value.toFixed(2)}${unit}`}
            vc={`var(--${hp.value > 0 ? 'up' : hp.value < 0 ? 'down' : 'flat'})`}
          />
          {hp.index != null && (
            <TooltipRow dot="var(--cat-goods)" k="Index" v={hp.index.toFixed(2)} />
          )}
          {showConsensus && hp.consensus != null && (
            <TooltipRow
              dot="var(--flat)"
              k="컨센서스"
              v={`${hp.consensus > 0 ? '+' : ''}${hp.consensus.toFixed(2)}${unit}`}
            />
          )}
        </div>
      )}
    </div>
  )
}

function TooltipRow({ dot, k, v, vc }: { dot: string; k: string; v: string; vc?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flex: '0 0 auto' }} />
      <span style={{ font: '400 12.5px/1 var(--font-sans)', color: 'var(--text-mid)' }}>{k}</span>
      <span style={{
        marginLeft: 'auto',
        fontFamily: 'var(--num)',
        fontWeight: 600,
        fontSize: 12.5,
        color: vc ?? 'var(--text-hi)',
        fontFeatureSettings: '"tnum" 1',
      }}>{v}</span>
    </div>
  )
}
