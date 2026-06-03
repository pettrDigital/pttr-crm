import type { NextRequest } from 'next/server'
import { search } from '@/lib/bigquery/queries'
import { verifyAuth } from '@/lib/auth/verify-token'

export async function GET(request: NextRequest) {
  try { await verifyAuth(request) } catch (e) { return e as Response }
  const term = request.nextUrl.searchParams.get('q')
  if (!term) return Response.json([])
  const results = await search(term)
  return Response.json(results)
}
