'use client'

import { useState } from 'react'
import type { SeriesWithStats } from '@/lib/types'
import { TagChips } from './TagChips'

export type SortKey = 'seriesId' | 'title' | 'category' | 'mom' | 'yoy'
export type SortDir = 'asc' | 'desc'

type ColId = SortKey | 'tags'

interface SeriesTableProps {
  rows: SeriesWithStats[]
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  selectedId: string | null
  onSelect: (id: string) => void
  page: number
  totalPages: number
  onPageChange: (p: number) => void
  totalCount: number
}

// 컬럼 정의 — id, 라벨, 정렬키(없으면 정렬 불가), 최소/초기 너비(px)
const COLUMNS: { id: ColId; label: string; sortKey?: SortKey; min: number; initial: number }[] = [
  { id: 'seriesId', label: 'Series ID', sortKey: 'seriesId', min: 90,  initial: 120 },
  { id: 'title',    label: '이름',      sortKey: 'title',    min: 140, initial: 300 },
  { id: 'tags',     label: '특징',                            min: 150, initial: 220 },
  { id: 'mom',      label: 'MoM',       sortKey: 'mom',      min: 80,  initial: 110 },
  { id: 'yoy',      label: 'YoY',       sortKey: 'yoy',      min: 80,  initial: 110 },
  { id: 'category', label: '카테고리',  sortKey: 'category', min: 90,  initial: 120 },
]

function fmtVal(v: number | null): string {
  if (v == null) return '—'
  return (v > 0 ? '+' : '') + v.toFixed(2) + '%'
}

function dirOf(v: number | null): 'up' | 'down' | 'flat' {
  if (v == null) return 'flat'
  return v > 0.02 ? 'up' : v < -0.02 ? 'down' : 'flat'
}

function ValCell({ v }: { v: number | null }) {
  const d = dirOf(v)
  const glyph = d === 'up' ? '▲' : d === 'down' ? '▼' : '—'
  return (
    <span className={`nw-val-${d}`} style={{ fontSize: 12 }}>
      {glyph} {fmtVal(v)}
    </span>
  )
}

export function SeriesTable({
  rows, sortKey, sortDir, onSort,
  selectedId, onSelect,
  page, totalPages, onPageChange, totalCount,
}: SeriesTableProps) {
  // 각 컬럼 너비를 상태로 관리 → 드래그로 조절
  const [widths, setWidths] = useState<number[]>(() => COLUMNS.map((c) => c.initial))

  // 컬럼 경계 드래그 시작
  function startResize(index: number, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation() // 헤더 클릭(정렬)으로 번지지 않게
    const startX = e.clientX
    const startW = widths[index]
    const min = COLUMNS[index].min

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      setWidths((prev) => {
        const next = [...prev]
        next[index] = Math.max(min, startW + delta)
        return next
      })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('nw-col-resizing')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    // 드래그 중 커서 고정 + 텍스트 선택 방지 (CSS로 처리)
    document.body.classList.add('nw-col-resizing')
  }

  const totalWidth = widths.reduce((a, b) => a + b, 0)

  // 컬럼별 셀 렌더
  function renderCell(col: ColId, s: SeriesWithStats) {
    switch (col) {
      case 'seriesId':
        return (
          <span style={{
            fontFamily: 'var(--num)', fontWeight: 600, fontSize: 12,
            color: s.seriesId === selectedId ? 'var(--accent)' : 'var(--text-hi)',
          }}>
            {s.seriesId}
          </span>
        )
      case 'title':
        return s.title
      case 'tags':
        return <TagChips tags={s.tags} max={2} />
      case 'mom':
        return <ValCell v={s.mom} />
      case 'yoy':
        return <ValCell v={s.yoy} />
      case 'category':
        return (
          <span style={{
            display: 'inline-block', padding: '2px 7px', borderRadius: 'var(--r-pill)',
            background: 'var(--surface-3)', fontSize: 11, color: 'var(--text-lo)',
          }}>
            {s.category}
          </span>
        )
    }
  }

  return (
    <div>
      <div className="nw-table-scroll">
      <table className="nw-series-table" style={{ tableLayout: 'fixed', width: totalWidth }}>
        <colgroup>
          {COLUMNS.map((c, i) => (
            <col key={c.id} style={{ width: widths[i] }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {COLUMNS.map((c, i) => {
              const sortable = c.sortKey != null
              const active = sortable && sortKey === c.sortKey
              const arrow = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''
              return (
                <th
                  key={c.id}
                  className={active ? 'active' : (sortable ? '' : 'nw-th-static')}
                  onClick={sortable ? () => onSort(c.sortKey!) : undefined}
                  aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  style={{ position: 'relative', cursor: sortable ? 'pointer' : 'default' }}
                >
                  {c.label}{arrow}
                  {/* 마지막 컬럼 뒤에는 리사이저를 두지 않는다 */}
                  {i < COLUMNS.length - 1 && (
                    <span
                      className="nw-col-resizer"
                      onMouseDown={(e) => startResize(i, e)}
                      onClick={(e) => e.stopPropagation()}
                      aria-hidden="true"
                    />
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr
              key={s.seriesId}
              onClick={() => onSelect(s.seriesId)}
              className={s.seriesId === selectedId ? 'nw-series-row--selected' : ''}
            >
              {COLUMNS.map((c) => (
                <td key={c.id} title={c.id === 'title' ? s.title : undefined}>
                  {renderCell(c.id, s)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-lo)' }}>
                데이터 없음
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      {/* 페이지네이션 */}
      <div className="nw-pagination">
        <span className="nw-pagination-info">
          총 {totalCount.toLocaleString()}개 시리즈
        </span>
        <button
          className="nw-btn-ghost"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          style={{ opacity: page === 0 ? 0.4 : 1, cursor: page === 0 ? 'not-allowed' : 'pointer' }}
        >
          이전
        </button>
        <span className="nw-pagination-info">
          {page + 1} / {Math.max(1, totalPages)}
        </span>
        <button
          className="nw-btn-ghost"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          style={{ opacity: page >= totalPages - 1 ? 0.4 : 1, cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer' }}
        >
          다음
        </button>
      </div>
    </div>
  )
}
