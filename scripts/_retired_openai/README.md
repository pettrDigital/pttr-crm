# RETIRED — Do Not Run

These scripts use the **wrong engine** (OpenAI paid API) AND contain
**wrong/superseded classification logic**. They were moved here on
2026-06-18 to prevent accidental execution and cost.

Do not run. Do not copy logic from. The authoritative classification
logic lives in:
- Gate: `bigquery/build_lead_timeline.sql` (opp_gate CTE, deployed)
- T7-classify taxonomy: `src/lib/classifier/t7-classifier.ts` (types + prompts)
- T7-match spec: `docs/PETTR_CRM_DATA_SPEC.md` §5.3
