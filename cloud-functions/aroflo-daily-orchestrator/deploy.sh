#!/bin/bash
# Deploy aroflo-daily-orchestrator with the latest build_opportunities.sql
# Run from the crm-build repo root.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Copy canonical SQL into deploy folder (single source of truth)
cp "$REPO_ROOT/bigquery/build_opportunities.sql" "$SCRIPT_DIR/build_opportunities.sql"
echo "Copied build_opportunities.sql from canonical source"

gcloud functions deploy aroflo-daily-orchestrator \
  --project=pttr-taskdata \
  --region=australia-southeast1 \
  --runtime=python312 \
  --entry-point=daily_orchestrator \
  --trigger-http \
  --timeout=3600 \
  --memory=512MiB \
  --source="$SCRIPT_DIR" \
  --no-allow-unauthenticated

echo "Deployed aroflo-daily-orchestrator"
