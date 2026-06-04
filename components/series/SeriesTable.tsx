'use client'

import type { SeriesWithStats } from '@/lib/types'

export type SortKey = 'seriesId' | 'title' | 'category' | 'mom' | 'yoy'
export type SortDir = 'asc' | 'desc'

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

function fmtVal(v: number | null): string {
  if (v == null) return '—'
  return (v > 0 ? '+' : '') + v.toFixed(2) + '%'
}

function dirOf(v: number | null): 'up' | 'down' | 'flat' {
  if (v == null) return 'flat'
  return v > 0.02 ? 'up' : v < -0.02 ? 'down' : 'flat'
}

function SortTh({
  label, sortKey, currentKey, currentDir, onSort,
}: {
  label: string; sortKey: SortKey; currentKey: SortKey; currentDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === currentKey
  const arrow = active ? (currentDir === 'asc' ? ' ▲' : ' ▼') : ''
  return (
    <th
      className={active ? 'active' : ''}
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (currentDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}{arrow}
    </th>
  )
}

export function SeriesTable({
  rows, sortKey, sortDir, onSort,
  selectedId, onSelect,
  page, totalPages, onPageChange, totalCount,
}: SeriesTableProps) {
  return (
    <div>
      <table className="nw-series-table">
        <thead>
          <tr>
            <SortTh label="Series ID" sortKey="seriesId" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
            <SortTh label="이름" sortKey="title" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
            <SortTh label="카테고리" sortKey="category" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
            <SortTh label="MoM" sortKey="mom" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
            <SortTh label="YoY" sortKey="yoy" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr
              key={s.seriesId}
              onClick={() => onSelect(s.seriesId)}
              className={s.seriesId === selectedId ? 'nw-series-row--selected' : ''}
            >
              <td>
                <span style={{
                  fontFamily: 'var(--num)',
                  fontWeight: 600,
                  fontSize: 12,
                  color: s.seriesId === selectedId ? 'var(--accent)' : 'var(--text-hi)',
                }}>
                  {s.seriesId}
                </span>
              </td>
              <td style={{ maxWidth: 260 }}>
                {s.title.length > 45 ? s.title.slice(0, 45) + '…' : s.title}
              </td>
              <td>
                <span style={{
                  display: 'inline-block',
                  padding: '2px 7px',
                  borderRadius: 'var(--r-pill)',
                  background: 'var(--surface-3)',
                  fontSize: 11,
                  color: 'var(--text-lo)',
                }}>
                  {s.category}
                </span>
              </td>
              <td>
                <span className={`nw-val-${dirOf(s.mom)}`} style={{ fontSize: 12 }}>
                  {dirOf(s.mom) === 'up' ? '▲' : dirOf(s.mom) === 'down' ? '▼' : '—'}{' '}
                  {fmtVal(s.mom)}
                </span>
              </td>
              <td>
                <span className={`nw-val-${dirOf(s.yoy)}`} style={{ fontSize: 12 }}>
                  {dirOf(s.yoy) === 'up' ? '▲' : dirOf(s.yoy) === 'down' ? '▼' : '—'}{' '}
                  {fmtVal(s.yoy)}
                </span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-lo)' }}>
                데이터 없음
              </td>
            </tr>
          )}
        </tbody>
      </table>

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
