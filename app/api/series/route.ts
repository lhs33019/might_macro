import { fetchAllSeriesWithStats } from '@/lib/queries/series'
import type { ApiError } from '@/lib/types'

export const revalidate = 3600  // 1시간 ISR 캐시

export async function GET(): Promise<Response> {
  try {
    const data = await fetchAllSeriesWithStats()
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
