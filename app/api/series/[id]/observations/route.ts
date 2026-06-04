import { fetchSeriesObservations } from '@/lib/queries/series'
import type { ApiError } from '@/lib/types'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params

  try {
    const data = await fetchSeriesObservations(id)
    if (!data) {
      const body: ApiError = {
        error: { code: 'SERIES_NOT_FOUND', message: `시리즈 없음: ${id}`, status: 404 },
      }
      return Response.json(body, { status: 404 })
    }
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
