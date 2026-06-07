import functions_framework
import requests
from datetime import datetime, timedelta
from google.cloud import bigquery, firestore

TASKS_URL = "https://aroflo-tasks-ingest-tuxv3ywlea-ts.a.run.app"
INVOICES_URL = "https://aroflo-invoices-ingest-tuxv3ywlea-ts.a.run.app"
INVOICE_ITEMS_URL = "https://aroflo-invoice-items-ingest-tuxv3ywlea-ts.a.run.app"
CLIENTS_URL = "https://aroflo-clients-ingest-tuxv3ywlea-ts.a.run.app"
TASKLABOURS_URL = "https://aroflo-tasklabours-ingest-tuxv3ywlea-ts.a.run.app"
TASKNOTES_URL = "https://aroflo-tasknotes-ingest-tuxv3ywlea-ts.a.run.app"
CUSTOMFIELDS_URL = "https://aroflo-customfields-ingest-tuxv3ywlea-ts.a.run.app"
LOCATIONS_URL = "https://aroflo-locations-ingest-tuxv3ywlea-ts.a.run.app"
CONTACTS_URL = "https://aroflo-contacts-ingest-tuxv3ywlea-ts.a.run.app"
QUOTES_URL = "https://aroflo-quotes-ingest-tuxv3ywlea-ts.a.run.app"
CLIENT_CF_URL = "https://aroflo-clientcustomfields-ingest-tuxv3ywlea-ts.a.run.app"
USERPROFILES_URL = "https://aroflo-userprofiles-ingest-tuxv3ywlea-ts.a.run.app"
PROJECT_ID = "pttr-taskdata"
DATASET_ID = "ds_aroflo"

@functions_framework.http
def daily_orchestrator(request):
    bq = bigquery.Client()
    date_start = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
    results = {}

    # --- TASKS ---
    r1 = requests.get(f"{TASKS_URL}?mode=full&date_start={date_start}&max_pages=50&date_field=lastupdatedutc", timeout=540)
    results["tasks_lastupdatedutc"] = r1.json()
    print(f"Tasks Run 1: {r1.json()}")

    r2 = requests.get(f"{TASKS_URL}?mode=full&date_start={date_start}&max_pages=50&date_field=createddatetimeutc", timeout=540)
    results["tasks_createddatetimeutc"] = r2.json()
    print(f"Tasks Run 2: {r2.json()}")

    # Merge tasks
    bq.query("""
        DELETE FROM `pttr-taskdata.ds_aroflo.tasks_deduped`
        WHERE taskid IN (SELECT taskid FROM `pttr-taskdata.ds_aroflo.tasks_raw`)
    """).result()
    bq.query("""
        INSERT INTO `pttr-taskdata.ds_aroflo.tasks_deduped`
        SELECT * EXCEPT(row_num)
        FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY taskid ORDER BY lastupdatedutc DESC NULLS LAST) as row_num
            FROM `pttr-taskdata.ds_aroflo.tasks_raw`
        )
        WHERE row_num = 1
    """).result()
    bq.query("TRUNCATE TABLE `pttr-taskdata.ds_aroflo.tasks_raw`").result()
    print("Tasks merge complete")

    # --- INVOICES ---
    r3 = requests.get(f"{INVOICES_URL}?mode=full&date_start={date_start}&max_pages=50", timeout=540)
    results["invoices"] = r3.json()
    print(f"Invoices Run 1: {r3.json()}")

    # Merge invoices
    bq.query("""
        DELETE FROM `pttr-taskdata.ds_aroflo.invoices_deduped`
        WHERE invoiceid IN (SELECT invoiceid FROM `pttr-taskdata.ds_aroflo.invoices_raw`)
    """).result()
    bq.query("""
        INSERT INTO `pttr-taskdata.ds_aroflo.invoices_deduped`
        SELECT * EXCEPT(row_num)
        FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY invoiceid ORDER BY dateinvoiced DESC NULLS LAST) as row_num
            FROM `pttr-taskdata.ds_aroflo.invoices_raw`
        )
        WHERE row_num = 1
    """).result()
    bq.query("TRUNCATE TABLE `pttr-taskdata.ds_aroflo.invoices_raw`").result()
    print("Invoices merge complete")

    # Rebuild invoices_for_bi
    bq.query("""
        CREATE OR REPLACE TABLE `pttr-taskdata.ds_aroflo.invoices_for_bi` AS
        SELECT
          invoiceid,
          invoicenumber,
          SAFE.PARSE_DATE('%Y/%m/%d', dateinvoiced) AS date_invoiced,
          SAFE.PARSE_DATE('%Y/%m/%d', duedate) AS date_due,
          SAFE_CAST(totalex AS NUMERIC) AS total_ex,
          SAFE_CAST(totalinc AS NUMERIC) AS total_inc,
          SAFE_CAST(totalgst AS NUMERIC) AS total_gst,
          task_jobnumber,
          task_taskname,
          task_tasktype,
          client_orgname AS client_name,
          client_orgid AS client_id,
          status,
          description,
          deliverystatus,
          EXTRACT(YEAR FROM SAFE.PARSE_DATE('%Y/%m/%d', dateinvoiced)) AS invoice_year,
          EXTRACT(MONTH FROM SAFE.PARSE_DATE('%Y/%m/%d', dateinvoiced)) AS invoice_month,
          FORMAT_DATE('%Y-%m', SAFE.PARSE_DATE('%Y/%m/%d', dateinvoiced)) AS invoice_month_key
        FROM `pttr-taskdata.ds_aroflo.invoices_deduped`
    """).result()
    print("invoices_for_bi rebuild complete")

    # --- INVOICE ITEMS ---
    wm_result = list(bq.query("""
        SELECT FORMAT_DATE('%Y-%m-%d', DATE_SUB(
            MAX(SAFE.PARSE_DATE('%Y/%m/%d', id.dateinvoiced)), INTERVAL 1 DAY
        )) AS watermark
        FROM `pttr-taskdata.ds_aroflo.invoice_items_deduped` ii
        JOIN `pttr-taskdata.ds_aroflo.invoices_deduped` id ON ii.invoiceid = id.invoiceid
    """).result())
    invoice_items_date_start = wm_result[0]["watermark"] if wm_result and wm_result[0]["watermark"] else date_start
    print(f"Invoice items watermark: {invoice_items_date_start}")

    r6 = requests.get(
        f"{INVOICE_ITEMS_URL}?date_start={invoice_items_date_start}&max_pages=10",
        timeout=540
    )
    results["invoice_items"] = r6.json()
    print(f"Invoice items: {r6.json()}")

    # Merge invoice items
    bq.query("""
        DELETE FROM `pttr-taskdata.ds_aroflo.invoice_items_deduped`
        WHERE lineid IN (SELECT lineid FROM `pttr-taskdata.ds_aroflo.invoice_items_raw`)
    """).result()
    bq.query("""
        INSERT INTO `pttr-taskdata.ds_aroflo.invoice_items_deduped`
        SELECT * EXCEPT(row_num)
        FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY lineid ORDER BY ingested_at DESC) as row_num
            FROM `pttr-taskdata.ds_aroflo.invoice_items_raw`
        )
        WHERE row_num = 1
    """).result()
    bq.query("TRUNCATE TABLE `pttr-taskdata.ds_aroflo.invoice_items_raw`").result()
    print("Invoice items merge complete")

    # --- CLIENTS ---
    r4 = requests.get(f"{CLIENTS_URL}?mode=full&date_start={date_start}&max_pages=50&date_field=lastupdatedutc", timeout=540)
    results["clients"] = r4.json()
    print(f"Clients Run 1: {r4.json()}")

    # Merge clients
    bq.query("""
        DELETE FROM `pttr-taskdata.ds_aroflo.clients_deduped`
        WHERE clientid IN (SELECT clientid FROM `pttr-taskdata.ds_aroflo.clients_raw`)
    """).result()
    bq.query("""
        INSERT INTO `pttr-taskdata.ds_aroflo.clients_deduped`
        SELECT * EXCEPT(row_num)
        FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY clientid ORDER BY lastupdatedutc DESC NULLS LAST) as row_num
            FROM `pttr-taskdata.ds_aroflo.clients_raw`
        )
        WHERE row_num = 1
    """).result()
    bq.query("TRUNCATE TABLE `pttr-taskdata.ds_aroflo.clients_raw`").result()
    print("Clients merge complete")

    # --- TASKLABOURS ---
    r5 = requests.get(
        f"{TASKLABOURS_URL}?date_start={date_start}&date_field=workdatetimestart&max_pages=10",
        timeout=540
    )
    results["tasklabours"] = r5.json()
    print(f"TaskLabours: {r5.json()}")

    # --- TASK NOTES ---
    r7 = requests.get(
        f"{TASKNOTES_URL}?mode=daily&date_start={date_start}&max_pages=50",
        timeout=540
    )
    results["tasknotes"] = r7.json()
    print(f"TaskNotes: {r7.json()}")

    # --- CUSTOM FIELDS ---
    r8 = requests.get(
        f"{CUSTOMFIELDS_URL}?date_start={date_start}&max_pages=50",
        timeout=540
    )
    results["customfields"] = r8.json()
    print(f"CustomFields: {r8.json()}")

    # --- LOCATIONS ---
    r9 = requests.get(
        f"{LOCATIONS_URL}?date_start={date_start}&max_pages=50",
        timeout=540
    )
    results["locations"] = r9.json()
    print(f"Locations: {r9.json()}")

    # --- CONTACTS ---
    r10 = requests.get(
        f"{CONTACTS_URL}?mode=daily&date_start={date_start}&max_pages=50",
        timeout=540
    )
    results["contacts"] = r10.json()
    print(f"Contacts: {r10.json()}")

    # --- QUOTES ---
    r11 = requests.get(
        f"{QUOTES_URL}?mode=daily&date_start={date_start}&max_pages=50",
        timeout=540
    )
    results["quotes"] = r11.json()
    print(f"Quotes: {r11.json()}")

    # --- CLIENT CUSTOM FIELDS ---
    r12 = requests.get(
        f"{CLIENT_CF_URL}?mode=daily&date_start={date_start}&max_pages=50",
        timeout=540
    )
    results["client_customfields"] = r12.json()
    print(f"ClientCustomFields: {r12.json()}")

    # --- USER PROFILES ---
    r13 = requests.get(
        f"{USERPROFILES_URL}?max_pages=10",
        timeout=540
    )
    results["userprofiles"] = r13.json()
    print(f"UserProfiles: {r13.json()}")

    # --- REBUILD OPPORTUNITIES TABLE (LAST — depends on all upstream syncs) ---
    # Connected-component clustering: spine events + AroFlo jobs → materialized table.
    # Uses CREATE TEMP TABLE/FUNCTION → runs as a multi-statement BQ script.
    # Idempotent: CREATE OR REPLACE TABLE + deterministic opportunity IDs.
    try:
        print("Starting opportunities rebuild...")
        opp_sql = _get_opportunities_sql()
        # Run as a script in US multi-region (where the datasets live)
        job = bq.query(opp_sql, location="US")
        job.result()  # Wait for completion
        print(f"Opportunities rebuild complete. Job state: {job.state}, job_id: {job.job_id}")
        results["opportunities_rebuild"] = {"status": "success", "job_id": job.job_id}
    except Exception as e:
        error_msg = f"Opportunities rebuild FAILED: {str(e)}"
        print(error_msg)
        results["opportunities_rebuild"] = {"status": "error", "error": str(e)}
        # Log but don't fail the orchestrator — stale table is still usable

    # --- AUTO-CLASSIFY AFTER-HOURS GAP CALLS (after opportunities rebuild) ---
    # Short after-hours calls (<20s) with no content at any source → Not Captured.
    # Runs server-side once daily, NOT on page load. Never overwrites human overrides.
    try:
        ah_result = _auto_classify_ah_gap(bq)
        results["ah_gap_auto_classify"] = ah_result
        print(f"After-hours gap auto-classify: {ah_result}")
    except Exception as e:
        error_msg = f"After-hours gap auto-classify FAILED: {str(e)}"
        print(error_msg)
        results["ah_gap_auto_classify"] = {"status": "error", "error": str(e)}

    return {"status": "success", "date_start": date_start, "runs": results}, 200


def _auto_classify_ah_gap(bq):
    """Auto-classify after-hours gap calls (<20s) as Not Captured / Dropped Call.

    Guard: NEVER overwrites a human override. Only writes when:
    - No Firestore doc exists for the opportunity, OR
    - An existing doc was auto-written (updated_by starts with 'auto_rule:')

    Tagged updated_by='auto_rule:ah_gap_short' so auto-writes are distinguishable.
    """
    # Find after-hours gap opportunities that are not captured (short calls)
    rows = list(bq.query("""
        SELECT opportunity_id
        FROM `pttr-taskdata.ds_crm.vw_lead_enriched`
        WHERE is_after_hours_gap = TRUE
          AND (captured IS NULL OR captured = FALSE)
    """, location="US").result())

    if not rows:
        return {"status": "success", "classified": 0, "skipped_human": 0}

    opp_ids = [row.opportunity_id for row in rows]
    db = firestore.Client(project=PROJECT_ID)
    collection = db.collection("crm_lead_overrides")

    # Batch-read existing overrides
    doc_refs = [collection.document(oid) for oid in opp_ids]
    existing_docs = {}
    # Firestore get_all supports batches
    for doc in db.get_all(doc_refs):
        if doc.exists:
            existing_docs[doc.id] = doc.to_dict()

    classified = 0
    skipped_human = 0
    batch = db.batch()
    batch_count = 0

    for oid in opp_ids:
        existing = existing_docs.get(oid)

        if existing:
            updated_by = existing.get("updated_by", "")
            # Human override exists — skip (never overwrite)
            if not str(updated_by).startswith("auto_rule:"):
                skipped_human += 1
                continue
            # Already auto-classified with same rule — skip (idempotent)
            if updated_by == "auto_rule:ah_gap_short":
                continue

        batch.set(collection.document(oid), {
            "opportunity_id": oid,
            "stage": "Not Captured",
            "sub_status": "Dropped Call",
            "loss_reason": None,
            "note": "Auto-classified: after-hours gap call <20s, no content at any source",
            "exclude_from_analysis": False,
            "updated_by": "auto_rule:ah_gap_short",
            "updated_at": datetime.utcnow(),
        }, merge=True)
        classified += 1
        batch_count += 1

        # Firestore batch limit is 500
        if batch_count >= 400:
            batch.commit()
            batch = db.batch()
            batch_count = 0

    if batch_count > 0:
        batch.commit()

    return {"status": "success", "classified": classified, "skipped_human": skipped_human}


def _get_opportunities_sql():
    """Load build_opportunities.sql from the deploy folder.
    Single source of truth: bigquery/build_opportunities.sql in crm-build repo.
    Copied into the function deploy folder at deploy time."""
    import os
    sql_path = os.path.join(os.path.dirname(__file__), "build_opportunities.sql")
    with open(sql_path) as f:
        return f.read()
