'use client'

import { Check } from 'lucide-react'

// ─── Segmented (period filter) ────────────────────────────────
interface SegmentedOption { v: string; label: string }

interface SegmentedProps {
  options: SegmentedOption[]
  value: string
  onChange: (v: string) => void
}

export function Segmented({ options, value, onChange }: SegmentedProps) {
  return (
    <div className="nw-seg">
      {options.map((o) => (
        <button
          key={o.v}
          className={'nw-seg-btn' + (o.v === value ? ' on' : '')}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── Toggle (2-up) ────────────────────────────────────────────
interface ToggleOption { v: string; label: string }

interface ToggleProps {
  options: ToggleOption[]
  value: string
  onChange: (v: string) => void
}

export function Toggle({ options, value, onChange }: ToggleProps) {
  return (
    <div className="nw-toggle">
      {options.map((o) => (
        <button
          key={o.v}
          className={'nw-toggle-btn' + (o.v === value ? ' on' : '')}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── CheckChip (consensus overlay) ───────────────────────────
interface CheckChipProps {
  checked: boolean
  onChange: (v: boolean) => void
  children: React.ReactNode
}

export function CheckChip({ checked, onChange, children }: CheckChipProps) {
  return (
    <button
      className={'nw-chip' + (checked ? ' on' : '')}
      onClick={() => onChange(!checked)}
    >
      <span className="nw-chip-box">
        {checked && <Check size={12} />}
      </span>
      {children}
    </button>
  )
}
