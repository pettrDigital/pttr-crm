// Shared types for interaction assembly (UI timeline + classifier)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryFn = <T>(sql: string, params?: Record<string, unknown>, types?: Record<string, any>) => Promise<T[]>

export interface Anchors {
  phones: string[]
  emails: string[]
  wcLeadIds: number[]
  allJobnumbers: string    // comma-separated
  oppTimestamp: string      // ISO/BQ timestamp string
  wcLeadId: number | null   // primary (backward compat)
}

export interface ResolveOpts {
  dataset?: string
  includeManualLinks?: boolean  // default true; false for classifier (avoids circularity)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  firestoreDb?: any             // FirebaseFirestore.Firestore | null — injected, not imported
}

export interface InteractionRow {
  interaction_id: string | null
  lead_id: number | null
  interaction_type: string
  interaction_datetime: string
  interaction_date: string
  interaction_time: string
  interaction_operator: string | null
  interaction_duration_seconds: number | null
  interaction_summary: string | null
  call_id: string | null
  called_did_label: string | null
}
