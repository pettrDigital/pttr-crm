import { NextRequest } from 'next/server'
import { verifyAuth } from '@/lib/auth/verify-token'
import { query } from '@/lib/bigquery/client'

const DS = 'pttr-taskdata.ds_aroflo'

export async function GET(request: NextRequest) {
  try { await verifyAuth(request) } catch (e) { return e as Response }
  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return Response.json([])

  // Search clients that have at least one Account-type job in AroFlo.
  // Uses job-level customer_type (reliable) instead of client-level terms (unreliable).
  const rows = await query(`
    SELECT
      cd.clientid AS account_id,
      cd.clientname AS account_name,
      cd.terms AS client_category,
      cd.phone,
      cd.address_suburb
    FROM \`${DS}.clients_deduped\` cd
    WHERE LOWER(cd.clientname) LIKE LOWER(@term)
      AND cd.clientid IN (
        SELECT DISTINCT td.client_clientid
        FROM \`${DS}.tasks_deduped\` td
        JOIN \`${DS}.tasks_complete\` tc ON td.jobnumber = tc.jobnumber
        WHERE tc.customer_type = 'Account'
      )
    ORDER BY cd.clientname
    LIMIT 20
  `, { term: `%${q}%` })

  return Response.json(rows)
}
