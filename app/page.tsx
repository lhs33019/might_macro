import { fetchDashboard } from '@/lib/queries/dashboard'
import { DashboardView } from '@/components/dashboard/DashboardView'
import type { DashboardResponse } from '@/lib/types'

// 서버 컴포넌트 — 실 Supabase 데이터를 사전계산해 DashboardView(클라이언트)로 전달 (M4)
export const revalidate = 3600

export default async function DashboardPage() {
  let data: DashboardResponse | null = null
  try {
    data = await fetchDashboard()
  } catch {
    // DB 연결 실패 시 null → 안내 표시
  }

  if (!data) {
    return (
      <div className="nw-app">
        <div className="nw-card" style={{ padding: '64px 0', textAlign: 'center', marginTop: 40 }}>
          <div className="t-title" style={{ fontSize: 15, marginBottom: 8 }}>
            대시보드 데이터를 불러올 수 없습니다
          </div>
          <div className="t-caption" style={{ color: 'var(--text-lo)' }}>
            Supabase 연결 상태와 series_trend_mv 적재를 확인하세요. (npm run ingest)
          </div>
        </div>
      </div>
    )
  }

  return <DashboardView data={data} />
}
