import { NextRequest } from 'next/server'
import { verifyAuth } from '@/lib/auth/verify-token'
import { query } from '@/lib/bigquery/client'

const DS = 'pttr-taskdata.ds_aroflo'

export async function GET(request: NextRequest) {
  try { await verifyAuth(request) } catch (e) { return e as Response }
  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return Response.json([])

  // Search clients_deduped directly — account_id = clientid (used for contact lookup).
  // Only Account-type clients (terms = '30 Days' is the Account marker in AroFlo).
  const rows = await query(`
    SELECT
      cd.clientid AS account_id,
      cd.clientname AS account_name,
      cd.terms AS client_category,
      cd.phone,
      cd.address_suburb
    FROM \`${DS}.clients_deduped\` cd
    WHERE LOWER(cd.clientname) LIKE LOWER(@term)
      AND cd.terms = '30 Days'
    ORDER BY cd.clientname
    LIMIT 20
  `, { term: `%${q}%` })

  return Response.json(rows)
}
