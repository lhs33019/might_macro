'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
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

  const allData = initialData?.data ?? []
  const movers  = initialData?.movers

  // 전체 데이터 정렬 (클라이언트 — 전체 기준)
  const sorted = useMemo<SeriesWithStats[]>(() => {
    return [...allData].sort((a, b) => {
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
  }, [allData, sortKey, sortDir])

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
      )}
    </>
  )
}
