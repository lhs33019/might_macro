import { fetchDashboard } from '@/lib/queries/dashboard'
import type { ApiError } from '@/lib/types'

export const revalidate = 3600  // 1시간 ISR 캐시 (사전계산·캐시 — 빠름 원칙)

export async function GET(): Promise<Response> {
  try {
    const data = await fetchDashboard()
    return Response.json(data)
  } catch (e) {
    const body: ApiError = {
      error: {
        code: 'DB_ERROR',
        message: e instanceof Error ? e.message : '조회 실패',
        status: 500,
      },
    }
    return Response.json(body, { status: 500 })
  }
}
