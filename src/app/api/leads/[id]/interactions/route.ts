import { NextRequest } from 'next/server'
import { verifyAuth } from '@/lib/auth/verify-token'
import { query } from '@/lib/bigquery/client'

const DS = 'pttr-taskdata.ds_crm'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try { await verifyAuth(request) } catch (e) { return e as Response }
  const { id: opportunityId } = await params

  try {
    // Read from the materialised lead_timeline table (build step 1, commit 9e7b768).
    // Single source of truth — UI sees exactly what the T7 classifier sees.
    // Full bodies fetched on demand via /api/leads/[id]/interaction endpoint (unchanged).
    const rows = await query(`
      SELECT
        interaction_id,
        lead_id,
        interaction_type,
        interaction_datetime,
        interaction_date,
        interaction_time,
        interaction_operator,
        interaction_duration_seconds,
        interaction_summary,
        call_id,
        called_did_label
      FROM \`${DS}.lead_timeline\`
      WHERE opportunity_id = @opportunityId
      ORDER BY interaction_datetime DESC
    `, { opportunityId })

    return Response.json(JSON.parse(JSON.stringify(rows)))
  } catch (error) {
    console.error('Interactions error:', error)
    return Response.json([])
  }
}
