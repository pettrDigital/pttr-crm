import { getJobs } from '@/lib/bigquery/queries'

export async function GET(request: Request) {
  const url = new URL(request.url)
  try {
    const rows = await getJobs()
    return Response.json(rows)
  } catch (error) {
    console.error('Jobs list error:', error)
    return Response.json([], { status: 500 })
  }
}
