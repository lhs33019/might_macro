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
  SeriesTag,
} from '@/lib/types'
import { tagTone } from '@/components/series/TagChips'

type Period  = '6M' | '1Y' | '3Y' | '5Y' | 'ALL'
type ObsMode = 'mom' | 'yoy'

const PAGE_SIZE = 20

// 태그 필터 바 표시 순서
const FILTER_TAGS: readonly SeriesTag[] = [
  '상승가속', '상승둔화', '상승지속',
  '하락가속', '하락둔화', '하락지속',
  '횡보', '추세반전', '10년최고', '10년최저', '역사적극단',
]

// 태그 칩 호버 설명 (의미가 겹쳐 보이는 태그만)
const TAG_TOOLTIPS: Partial<Record<SeriesTag, string>> = {
  '역사적극단': '최신 YoY가 10년 분포 상위 5%(P95↑) 또는 하위 5%(P5↓) — 10년최고/최저(범위 끝값 근접)보다 넓은 꼬리 기준',
}

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
  const [activeTags, setActiveTags] = useState<ReadonlySet<SeriesTag>>(() => new Set())

  const allData = useMemo(() => initialData?.data ?? [], [initialData])
  const movers  = initialData?.movers

  // 태그별 시리즈 개수 (필터 바 카운트 표기용)
  const tagCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {}
    for (const s of allData) {
      for (const t of s.tags) counts[t] = (counts[t] ?? 0) + 1
    }
    return counts
  }, [allData])

  // 검색어 + 태그 필터 (태그는 다중 선택 시 AND — 전부 일치)
  const filtered = useMemo<readonly SeriesWithStats[]>(() => {
    const q = query.trim().toLowerCase()
    return allData.filter((s) => {
      const matchQuery =
        !q || s.seriesId.toLowerCase().includes(q) || s.title.toLowerCase().includes(q)
      const matchTags =
        activeTags.size === 0 || [...activeTags].every((t) => s.tags.includes(t))
      return matchQuery && matchTags
    })
  }, [allData, query, activeTags])

  const handleToggleTag = useCallback((tag: SeriesTag) => {
    setActiveTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
    setPage(0) // 필터 변경 시 첫 페이지로
  }, [])

  // 검색 결과 정렬 (클라이언트 — 전체 기준)
  const sorted = useMemo<SeriesWithStats[]>(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number | null
      let bv: string | number | null
      if (sortKey === 'seriesId') { av = a.seriesId; bv = b.seriesId }
      else if (sortKey === 'title') { av = a.title; bv = b.title }
      else if (sortKey === 'category') { av = a.category; bv = b.category }
      else if (sortKey === 'mom') { av = a.mom; bv = b.mom }
      else if (sortKey === 'ann3m') { av = a.ann3m; bv = b.ann3m }
      else if (sortKey === 'yoyPctile') { av = a.yoyPctile10y; bv = b.yoyPctile10y }
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
            PPI 상품·산업 시리즈 · MoM·YoY·10년 백분위 기준 정렬 가능
          </span>
        </div>
        {initialData && (
          <span className="t-caption" style={{ marginLeft: 'auto', color: 'var(--text-lo)' }}>
            {initialData.total.toLocaleString()}개 시리즈
          </span>
        )}
      </header>

      {/* ── Top Movers (3열 × 상·하위 2행 — 열 단위로 메트릭 쌍 정렬) ── */}
      {movers && (
        <div className="nw-series-movers">
          <TopMoversTable title="MoM 상위 5 ▲" rows={movers.momTop}    metric="mom" />
          <TopMoversTable title="YoY 상위 5 ▲" rows={movers.yoyTop}    metric="yoy" />
          <TopMoversTable title="10Y 백분위 상위 5 ▲" rows={movers.pctileTop} metric="pctile" />
          <TopMoversTable title="MoM 하위 5 ▼" rows={movers.momBottom} metric="mom" />
          <TopMoversTable title="YoY 하위 5 ▼" rows={movers.yoyBottom} metric="yoy" />
          <TopMoversTable title="10Y 백분위 하위 5 ▼" rows={movers.pctileBottom} metric="pctile" />
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

        {/* ── 태그 필터 ── */}
        <div className="nw-tag-filter">
          <span className="t-label" style={{ marginRight: 4 }}>특징 필터</span>
          {FILTER_TAGS.map((t) => {
            const count = tagCounts[t] ?? 0
            const on = activeTags.has(t)
            return (
              <button
                key={t}
                className={`nw-tag nw-tag--${tagTone(t)} nw-tag-btn${on ? ' is-active' : ''}`}
                onClick={() => handleToggleTag(t)}
                disabled={count === 0}
                aria-pressed={on}
                title={TAG_TOOLTIPS[t]}
              >
                #{t}<span className="nw-tag-count">{count.toLocaleString()}</span>
              </button>
            )
          })}
          {activeTags.size > 0 && (
            <button
              className="nw-btn-ghost"
              onClick={() => { setActiveTags(new Set()); setPage(0) }}
              style={{ marginLeft: 4 }}
            >
              <X size={14} /> 필터 해제
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
              tags={selectedMeta?.tags ?? []}
              latestYoy={selectedMeta?.yoy ?? null}
              deltaYoy={selectedMeta?.deltaYoy ?? null}
              yoyMin10y={selectedMeta?.yoyMin10y ?? null}
              yoyMax10y={selectedMeta?.yoyMax10y ?? null}
              ann3m={selectedMeta?.ann3m ?? null}
              accel3m={selectedMeta?.accel3m ?? null}
              yoyPctile10y={selectedMeta?.yoyPctile10y ?? null}
              momPctile10y={selectedMeta?.momPctile10y ?? null}
              yoyZ10y={selectedMeta?.yoyZ10y ?? null}
            />
          )}
        </div>
        </>
      )}
    </>
  )
}
