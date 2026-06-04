import type { Metadata } from 'next'
import { fetchAllSeriesWithStats } from '@/lib/queries/series'
import { SeriesExplorer } from './SeriesExplorer'

export const metadata: Metadata = {
  title: '시리즈 탐색 · PPI Insight',
  description: 'PPI 관련 전체 시리즈 목록, 전월비·전년비 상위·하위 시리즈',
}

export default async function SeriesPage() {
  let data = null
  try {
    data = await fetchAllSeriesWithStats()
  } catch {
    // 에러 시 null — SeriesExplorer에서 빈 상태 표시
  }

  return (
    <div className="nw-app">
      <SeriesExplorer initialData={data} />
    </div>
  )
}
