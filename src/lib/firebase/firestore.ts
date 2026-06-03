import {
  collection,
  addDoc,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './client'

// ─── NOTES ──────────────────────────────────────────────────────────────────
export async function addLeadNote(leadId: string, noteText: string, createdBy: string) {
  return addDoc(collection(db, 'crm_notes'), {
    lead_id: leadId,
    account_id: null,
    note_text: noteText,
    created_by: createdBy,
    created_at: serverTimestamp(),
  })
}

export async function addAccountNote(accountId: string, noteText: string, createdBy: string) {
  return addDoc(collection(db, 'crm_account_notes'), {
    account_id: accountId,
    note_text: noteText,
    created_by: createdBy,
    created_at: serverTimestamp(),
  })
}

// ─── LEAD OVERRIDES ─────────────────────────────────────────────────────────
export async function setLeadFunnelOverride(leadId: string, manualFunnelStage: string, updatedBy: string) {
  return setDoc(doc(db, 'crm_lead_overrides', leadId), {
    manual_funnel_stage: manualFunnelStage,
    updated_by: updatedBy,
    updated_at: serverTimestamp(),
  })
}
