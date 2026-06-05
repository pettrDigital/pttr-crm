import {
  collection,
  addDoc,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query as fsQuery,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './client'

// ─── CLASSIFICATION OVERRIDE ────────────────────────────────────────────────
// One doc per opportunity. Keys on opportunity_id.
// { opportunity_id, stage, sub_status, loss_reason?, note?, updated_by, updated_at }
export interface ClassificationOverride {
  opportunity_id: string
  stage: string
  sub_status: string
  loss_reason?: string | null
  note?: string | null
  updated_by: string
  updated_at: unknown
}

export async function setClassification(
  opportunityId: string,
  data: { stage: string; sub_status: string; loss_reason?: string | null; note?: string | null },
  updatedBy: string
) {
  return setDoc(doc(db, 'crm_lead_overrides', opportunityId), {
    opportunity_id: opportunityId,
    stage: data.stage,
    sub_status: data.sub_status,
    loss_reason: data.loss_reason || null,
    note: data.note || null,
    updated_by: updatedBy,
    updated_at: serverTimestamp(),
  })
}

export async function getClassification(opportunityId: string): Promise<ClassificationOverride | null> {
  const snap = await getDoc(doc(db, 'crm_lead_overrides', opportunityId))
  if (!snap.exists()) return null
  return snap.data() as ClassificationOverride
}

// ─── NOTES ──────────────────────────────────────────────────────────────────
export interface CrmNote {
  id: string
  opportunity_id: string
  note_text: string
  created_by: string
  created_at: unknown
}

export async function addNote(opportunityId: string, noteText: string, createdBy: string) {
  return addDoc(collection(db, 'crm_notes'), {
    opportunity_id: opportunityId,
    lead_id: null,
    account_id: null,
    note_text: noteText,
    created_by: createdBy,
    created_at: serverTimestamp(),
  })
}

export async function getNotes(opportunityId: string): Promise<CrmNote[]> {
  const q = fsQuery(
    collection(db, 'crm_notes'),
    where('opportunity_id', '==', opportunityId),
    orderBy('created_at', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CrmNote))
}

// ─── ACCOUNT NOTES ──────────────────────────────────────────────────────────
export async function addAccountNote(accountId: string, noteText: string, createdBy: string) {
  return addDoc(collection(db, 'crm_account_notes'), {
    account_id: accountId,
    note_text: noteText,
    created_by: createdBy,
    created_at: serverTimestamp(),
  })
}
