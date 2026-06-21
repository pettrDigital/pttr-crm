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

**ENGINE**: OpenAI GPT-4.1 (`gpt-4.1`), wired 2026-06-21. Replaces CC-as-classifier by explicit owner decision. API calls via `src/lib/ai/openai-client.ts`, key from GCP Secret Manager (`openai-api-key`). Accuracy validation against CC's 89.1% benchmark pending first production run.

**RULE**: The T7.2 engine reads each lead's full timeline and classifies per the NQ/NB or Booked prompt with pre-pass constraints. NEVER substitute a keyword approximation, BQ CASE WHEN, or "signal extraction" shortcut.

**WHY**: On 2026-06-20, CC substituted a BQ keyword classifier for the validated T7.2 model to classify 596 leads in one query. The keyword patterns were too narrow -- 121 leads defaulted to NFUR/CU when the keywords didn't fire, producing wrong classifications. The keyword approach was never in the spec, never validated, and silently degraded accuracy.

**THE RULE**: If the volume is too large for one pass, batch it (50 leads per batch, ~12 rounds for 600 leads). Speed is not a reason to change the engine.

**EXTRAPOLATING A CLASSIFICATION ACROSS LEADS WITHOUT READING THEIR CONTENT IS A SUBSTITUTED ENGINE** (added 2026-06-20): Reading N leads, observing the dominant classification, then applying that classification to the remaining leads without reading their timelines is not "batching" -- it is a substituted engine.

**BOOKED RATIONALE MUST QUOTE THE LABOUR NOTE**: For every judgement:Booked:completed_zero lead, the T72Rationale `timeline_summary` field MUST include the verbatim TECH LABOUR NOTE content (or its first 200 chars if longer). validateVerdict rejects Booked rationale where timeline_summary does not contain text from the labour note.

**NO PARALLEL AGENTS FOR CLASSIFICATION**: Classification must run sequentially (one lead at a time via API), not delegated to parallel agents or background workers.

## How the Cascade Runs (classification flow)

**Cascade flags:**
- `--population=<P>` — `live_post_dec2025` (default), `historical_pre_dec2025`
- `--mode=<M>` — `full` (default), `deterministic`
- `--scope=<S>` — date window: `100d` (default), `30d`, `90d`, `all`. Auto-set to `all` for non-live populations.
- `--step=N` — resume from step N. `--run-id=ID` — required for step 8 when using `--halt-at-seam`.
- `--halt-at-seam` — pause at AI seams instead of running OpenAI inline. Default: run end-to-end with OpenAI.

**End-to-end run (default — OpenAI inline):**

```
npx tsx scripts/run-cascade.ts --skip-sync
```

Runs Steps 0-9 without halting. OpenAI GPT-4.1 classifies inline at Steps 5 (T7.1 match)
and 7 (T7.2 classify), validates and merges (Step 8), readout (Step 9).

**Step gating by mode:**
- `deterministic` — Steps 5, 6, 7, 8 skipped (no AI). Runs 0-4, 9. CASCADE COMPLETE.
- `full` — full pipeline. AI seams run inline (or halt with `--halt-at-seam`).

**Reconciliation (separate script):**

```
npx tsx scripts/run-reconciliation.ts [--csv=data/reconciliation/enriched_leads.csv]
```

Loads the dashboard CSV to BQ, compares against existing cascade output, runs footing
check, outputs `docs/t7_wc_reconciliation_full.md`. Does not run the cascade.

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
| `docs/t7_wc_reconciliation_full.md` | Reconciliation output (stale — regenerate after run) |
| `docs/END_TO_END_FUNCTION.md` | Cascade function detailed sub-spec |
| `bigquery/vw_leads_unified.sql` | Deployed spine (call + form + email) |
| `bigquery/vw_lead_enriched.sql` | Deployed lean read surface + revenue model (v4) |
| `bigquery/vw_economics.sql` | Per-segment marketing economics view |
| `bigquery/build_opportunities.sql` | Materialized opportunity clustering script |
| `scripts/run-cascade.ts` | Cascade function (Steps 0-9, OpenAI GPT-4.1) |
| `scripts/run-reconciliation.ts` | Standalone reconciliation vs dashboard CSV |
| `src/lib/ai/openai-client.ts` | OpenAI API client + token tracking |
| `src/lib/ai/prompts.ts` | Prompt wrappers (T72Rationale output schema) |
| `src/lib/classifier/t7-classifier.ts` | System prompts (BOOKED, NQ/NB, MATCH) |
| `src/lib/classifier/taxonomy.ts` | Canonical taxonomy (27 leaves, single source of truth) |
| `data/reconciliation/enriched_leads.csv` | Dashboard CSV for reconciliation |
| `cloud-functions/aroflo-daily-orchestrator/main.py` | Orchestrator: data sync + rebuild |
| `src/app/api/leads/route.ts` | Leads API: BQ + Firestore merge |
| `HANDOVER.md` | CRM app (Next.js) technical handover |
