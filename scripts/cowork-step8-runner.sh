#!/bin/bash
set -u
# NOT set -e — we want to capture failures, not exit on them

# launchd does not inherit shell PATH — set it explicitly
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

CRM_ROOT="/Users/ricgordon/crm-build"
WRAPPER_LOG_DIR="$CRM_ROOT/.cowork-step8-logs"
mkdir -p "$WRAPPER_LOG_DIR"

# ── 1. Poll for next 'ready' row, oldest first
# Use bq command-line, not gcloud, since launchd inherits Ric's gcloud auth.
NEXT_READY=$(bq query --location=US --use_legacy_sql=false --format=csv --quiet \
  "SELECT run_id FROM \`pttr-taskdata.ds_crm.t7_run_control\`
   WHERE status='ready'
   ORDER BY created_at ASC
   LIMIT 1" \
  | tail -n 1)

# No ready runs → exit silently
if [ -z "$NEXT_READY" ] || [ "$NEXT_READY" = "run_id" ]; then
  exit 0
fi

RUN_ID="$NEXT_READY"

# ── 2. Validate run_id format (input hygiene, not validation logic)
# Reject anything that isn't [a-zA-Z0-9_]+ to prevent shell injection via the run_id arg.
if ! [[ "$RUN_ID" =~ ^[a-zA-Z0-9_]+$ ]]; then
  bq query --location=US --use_legacy_sql=false --quiet \
    "UPDATE \`pttr-taskdata.ds_crm.t7_run_control\`
     SET status='failed', completed_at=CURRENT_TIMESTAMP(),
         error_text='Invalid run_id format — rejected by wrapper input hygiene'
     WHERE run_id='$RUN_ID'"
  exit 1
fi

# ── 3. Mark as running. If UPDATE affects 0 rows, another wrapper instance picked it up.
bq query --location=US --use_legacy_sql=false --format=csv --quiet \
  "UPDATE \`pttr-taskdata.ds_crm.t7_run_control\`
   SET status='running', started_at=CURRENT_TIMESTAMP()
   WHERE run_id='$RUN_ID' AND status='ready'"
# No reliable way in bq cli to get UPDATE row count, so race conditions just mean both
# try to run Step 8; the second will hit empty staging and exit harmlessly. Acceptable.

# ── 4. Run Step 8 — THE KEYSTROKE
cd "$CRM_ROOT"
OUT_FILE="$WRAPPER_LOG_DIR/${RUN_ID}.out"
ERR_FILE="$WRAPPER_LOG_DIR/${RUN_ID}.err"

npx tsx scripts/run-cascade.ts --step=8 --run-id="$RUN_ID" \
  >"$OUT_FILE" 2>"$ERR_FILE"
EXIT_CODE=$?

# ── 5. Write outcome back to control row
ERROR_FILE_FINAL=""
ERROR_TEXT=""
STATUS=""

if [ $EXIT_CODE -eq 0 ]; then
  STATUS="complete"
else
  STATUS="failed"
  ERROR_FILE_FINAL="$WRAPPER_LOG_DIR/${RUN_ID}.error"
  mv "$ERR_FILE" "$ERROR_FILE_FINAL"
  # Read stderr, escape for BQ SQL string:
  #   1. Replace backslashes first (before adding new ones)
  #   2. Replace single quotes → doubled single quotes (BQ string escaping)
  #   3. Replace newlines → \n literal (keep it single-line for SQL)
  #   4. Truncate to 4000 chars (BQ STRING has no limit, but keeps UPDATE manageable)
  ERROR_TEXT=$(cat "$ERROR_FILE_FINAL" \
    | sed "s/\\\\/\\\\\\\\/g" \
    | sed "s/'/''/g" \
    | tr '\n' ' ' \
    | cut -c1-4000)
fi

if [ "$STATUS" = "complete" ]; then
  bq query --location=US --use_legacy_sql=false --quiet \
    "UPDATE \`pttr-taskdata.ds_crm.t7_run_control\`
     SET status='complete',
         completed_at=CURRENT_TIMESTAMP(),
         exit_code=$EXIT_CODE,
         error_text=NULL,
         error_file_path=NULL
     WHERE run_id='$RUN_ID'"
else
  bq query --location=US --use_legacy_sql=false --quiet \
    "UPDATE \`pttr-taskdata.ds_crm.t7_run_control\`
     SET status='failed',
         completed_at=CURRENT_TIMESTAMP(),
         exit_code=$EXIT_CODE,
         error_text='$ERROR_TEXT',
         error_file_path='$ERROR_FILE_FINAL'
     WHERE run_id='$RUN_ID'"
fi

exit $EXIT_CODE
