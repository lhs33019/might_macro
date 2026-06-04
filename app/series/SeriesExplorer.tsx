'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, Search, X } from 'lucide-react'
import { TopMoversTable } from '@/components/series/TopMoversTable'
import { SeriesTable, type SortKey, type SortDir } from '@/components/series/SeriesTable'
import { SeriesDetailPanel } from '@/components/series/SeriesDetailPanel'
import { isApiError } from '@/lib/types'
import type {
  SeriesFullListResponse,
  SeriesWithStats,
  ObservationListResponse,
} from '@/lib/types'

type Period  = '6M' | '1Y' | '3Y' | '5Y' | 'ALL'
type ObsMode = 'mom' | 'yoy'

const PAGE_SIZE = 20

interface SeriesExplorerProps {
  initialData: SeriesFullListResponse | null
}

export function SeriesExplorer({ initialData }: SeriesExplorerProps) {
  const [sortKey, setSortKey]     = useState<SortKey>('seriesId')
  const [sortDir, setSortDir]     = useState<SortDir>('asc')
  const [page, setPage]           = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedMeta, setSelectedMeta] = useState<SeriesWithStats | null>(null)
  const [observations, setObservations] = useState<ObservationListResponse | null>(null)
  const [obsLoading, setObsLoading]     = useState(false)
  const [period, setPeriod]       = useState<Period>('3Y')
  const [mode, setMode]           = useState<ObsMode>('mom')
  const [query, setQuery]         = useState('')

  const allData = initialData?.data ?? []
  const movers  = initialData?.movers

  // 검색 필터 (시리즈 ID 또는 이름 — 대소문자 무시)
  const filtered = useMemo<readonly SeriesWithStats[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allData
    return allData.filter(
      (s) => s.seriesId.toLowerCase().includes(q) || s.title.toLowerCase().includes(q),
    )
  }, [allData, query])

  // 검색 결과 정렬 (클라이언트 — 전체 기준)
  const sorted = useMemo<SeriesWithStats[]>(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number | null
      let bv: string | number | null
      if (sortKey === 'seriesId') { av = a.seriesId; bv = b.seriesId }
      else if (sortKey === 'title') { av = a.title; bv = b.title }
      else if (sortKey === 'category') { av = a.category; bv = b.category }
      else if (sortKey === 'mom') { av = a.mom; bv = b.mom }
      else { av = a.yoy; bv = b.yoy }

      // null은 항상 뒤로
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1

      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
  }, [filtered, sortKey, sortDir])

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value)
    setPage(0)  // 검색어 변경 시 첫 페이지로
  }, [])

  const pageSlice  = useMemo(() => sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [sorted, page])
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)

  const handleSort = useCallback((key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(0)
  }, [sortKey])

  const handleSelect = useCallback(async (id: string) => {
    if (id === selectedId) {
      setSelectedId(null)
      setSelectedMeta(null)
      setObservations(null)
      return
    }
    setSelectedId(id)
    setSelectedMeta(allData.find((d) => d.seriesId === id) ?? null)
    setObsLoading(true)
    setObservations(null)

    try {
      const res = await fetch(`/api/series/${id}/observations`)
      const json: unknown = await res.json()
      if (isApiError(json)) {
        setObservations(null)
      } else {
        setObservations(json as ObservationListResponse)
      }
    } catch {
      setObservations(null)
    } finally {
      setObsLoading(false)
    }
  }, [selectedId, allData])

  const handleClose = useCallback(() => {
    setSelectedId(null)
    setSelectedMeta(null)
    setObservations(null)
  }, [])

  return (
    <>
      {/* ── 헤더 ── */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '18px 0',
        borderBottom: '1px solid var(--border-subtle)',
        marginBottom: 24,
        flexWrap: 'wrap',
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <button className="nw-btn-ghost" aria-label="대시보드로">
            <ChevronLeft size={15} /> 대시보드
          </button>
        </Link>
        <div>
          <span className="t-title" style={{ fontSize: 15 }}>시리즈 탐색</span>
          <span className="t-caption" style={{ marginLeft: 12 }}>
            PPI 관련 전체 시리즈 · MoM·YoY 기준 정렬 가능
          </span>
        </div>
        {initialData && (
          <span className="t-caption" style={{ marginLeft: 'auto', color: 'var(--text-lo)' }}>
            {initialData.total.toLocaleString()}개 시리즈
          </span>
        )}
      </header>

      {/* ── Top Movers ── */}
      {movers && (
        <div className="nw-series-movers">
          <TopMoversTable title="MoM 상위 5 ▲" rows={movers.momTop}    metric="mom" />
          <TopMoversTable title="MoM 하위 5 ▼" rows={movers.momBottom} metric="mom" />
          <TopMoversTable title="YoY 상위 5 ▲" rows={movers.yoyTop}    metric="yoy" />
          <TopMoversTable title="YoY 하위 5 ▼" rows={movers.yoyBottom} metric="yoy" />
        </div>
      )}

      {/* ── 본문 ── */}
      {!initialData ? (
        <div className="nw-card" style={{ padding: '48px 0', textAlign: 'center' }}>
          <div className="t-caption" style={{ color: 'var(--text-lo)' }}>
            데이터를 불러올 수 없습니다. DB 연결 상태를 확인하세요.
          </div>
        </div>
      ) : (
        <>
        {/* ── 검색창 ── */}
        <div className="nw-search">
          <Search className="nw-search-icon" size={16} aria-hidden />
          <input
            type="text"
            className="nw-search-input"
            placeholder="시리즈 ID 또는 이름으로 검색 (예: PPIFIS, Final Demand)"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            aria-label="시리즈 검색"
          />
          {query && (
            <button
              className="nw-search-clear"
              onClick={() => handleQueryChange('')}
              aria-label="검색어 지우기"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div className="nw-series-body">
          {/* 시리즈 목록 */}
          <div className="nw-card" style={{ minWidth: 0 }}>
            <SeriesTable
              rows={pageSlice}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              selectedId={selectedId}
              onSelect={handleSelect}
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              totalCount={sorted.length}
            />
          </div>

          {/* 상세 패널 */}
          {selectedId && (
            <SeriesDetailPanel
              seriesId={selectedId}
              seriesTitle={selectedMeta?.title ?? selectedId}
              seriesUnits={selectedMeta?.units ?? ''}
              observations={observations?.data ?? null}
              loading={obsLoading}
              period={period}
              onPeriodChange={setPeriod}
              mode={mode}
              onModeChange={setMode}
              onClose={handleClose}
            />
          )}
        </div>
        </>
      )}
    </>
  )
}
