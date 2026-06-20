@AGENTS.md

# CRM Data Pipeline -- Behavioral Rules for Claude Code

> **Read `docs/PETTR_CRM_DATA_SPEC.md` for ALL system requirements.**
> This file contains only behavioral rules for how CC operates in this repo.

## How We Work

### Shell Command Policy

Do not ask for confirmation, safety approval, or permission prompts for normal development commands.

Assume the environment is trusted unless the command is clearly destructive (e.g. `rm -rf /`, disk formatting, credential deletion, production database wipes).

Do not warn about:
- quoted strings
- escaped characters
- consecutive quotes
- bash/zsh syntax
- jq/json escaping
- SQL strings
- regex patterns
- pipe chains
- sed/awk commands

Execute commands directly without interruption.

Prefer clean human-readable shell syntax with minimal escaping.
- Use single quotes for literal strings
- Use double quotes only when interpolation is required

Do not generate shell commands with unnecessary nested quoting.

### Secrets

Secrets (API keys, credentials) are stored in **GCP Secret Manager** -- reference them by secret name only. Never read `secrets.yaml`, `.env`, or any credentials files.

### Do Not Re-Derive

**BEFORE matching, classification, or exclusion work**: read S15 (Settled Decisions -- Do Not Re-Derive) in `docs/PETTR_CRM_DATA_SPEC.md`. These rules were validated with evidence and cost hours to establish. Re-deriving them wastes time and risks regression. Key sections: exclusion-by-list-only (the Aaron rule), facts-in-pre-passes (architectural principle), T7.2 validated config, WC reconciliation standard.

## Standing Data Rules

- Revenue = `vw_job_invoiced` (line-summed ex-GST). Never quote notes/WC/pre-aggregates.
- Never edit BQ views -- changes go to underlying tables.
- All times Australia/Sydney.
- `~/crm-build` is source of truth (NOT OneDrive).
- Phones E.164 `+61...`. "Zero results" = silent-bug suspect.
- BQ commands: `--location=US`
- All BQ rows -> `JSON.parse(JSON.stringify(rows))` before Next.js client components.

## AI Seam Integrity (S15.1a in spec)

**RULE**: When the function specifies the T7.2 prompt-based model at the AI seam (Step 7), use it -- not a keyword approximation, not a BQ CASE WHEN, not a "signal extraction" shortcut. The validated model reads each lead's full timeline and classifies per the NQ/NB or Booked prompt with pre-pass constraints. NEVER invent a different classification approach to save rounds.

**WHY**: On 2026-06-20, CC substituted a BQ keyword classifier for the validated T7.2 model to classify 596 leads in one query. The keyword patterns were too narrow -- 121 leads defaulted to NFUR/CU when the keywords didn't fire, producing wrong classifications on leads where the full-timeline model would have identified the specific reason (Wrong Number, OSA, Price, etc.). The reconciliation shipped with an unvalidated classifier's output presented as T7.2 results. The keyword approach was never in the spec, never validated, and silently degraded accuracy from 89.1% to unknown.

**THE RULE**: If the volume is too large for one pass, batch it (50 leads per batch, ~12 rounds for 600 leads) and say so. Speed is not a reason to change the engine. If you cannot run the specified engine at the required volume, say that -- do not silently downgrade.

## Starting a New Session

Read these docs IN THIS ORDER before doing any work:

1. **`docs/PETTR_CRM_DATA_SPEC.md`** — the canonical spec. ALL requirements, architecture, settled decisions. Read S15 (settled decisions) and S16 (known gaps) first.
2. **`docs/SESSION_HANDOFF.md`** — current status. What's built, what's pending, what's next.
3. **`docs/t7_wc_reconciliation_full.md`** — latest reconciliation output (reference, not requirements).
4. **This file** — behavioral rules for CC.

Do NOT re-derive anything in S15. Do NOT substitute classifiers (see AI Seam Integrity above). Read before building.

## Key Paths

| File | Purpose |
|---|---|
| `docs/PETTR_CRM_DATA_SPEC.md` | **Canonical** requirements spec (S0-S18) |
| `docs/SESSION_HANDOFF.md` | Current status snapshot (what's built/pending) |
| `docs/t7_wc_reconciliation_full.md` | WC reconciliation output (1,215 leads footed) |
| `docs/END_TO_END_FUNCTION.md` | Cascade function detailed sub-spec |
| `bigquery/vw_leads_unified.sql` | Deployed spine (call + form + email) |
| `bigquery/vw_lead_enriched.sql` | Deployed lean read surface + revenue model (v4) |
| `bigquery/vw_economics.sql` | Per-segment marketing economics view |
| `bigquery/build_opportunities.sql` | Materialized opportunity clustering script |
| `scripts/run-cascade.ts` | Cascade function (Steps 0-9) |
| `cloud-functions/aroflo-daily-orchestrator/main.py` | Orchestrator: data sync + rebuild + auto-classify |
| `cloud-functions/aroflo-daily-orchestrator/deploy.sh` | Deploy script (copies canonical SQL then deploys) |
| `src/components/leads/lead-classification.tsx` | Classification taxonomy UI |
| `src/app/api/leads/route.ts` | Leads API: BQ + Firestore merge |
| `HANDOVER.md` | CRM app (Next.js) technical handover |
