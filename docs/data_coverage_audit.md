# Data Coverage Audit

Generated: 2026-06-13

---

## Part 1: Source Table Inventory

### ds_crm (CRM pipeline tables)

#### raw_calls (72,608 rows)
| Column | Type | Pop Rate | Description |
|--------|------|----------|-------------|
| call_id | STRING | 100% | 8x8 CDR unique call identifier |
| start_time | TIMESTAMP | 100% | Call start timestamp |
| disconnected_time | TIMESTAMP | 100% | Call end timestamp |
| direction | STRING | 100% | Incoming/Outgoing |
| caller | STRING | 100% | Caller extension or phone |
| caller_name | STRING | 100% | Caller display name (often DID label) |
| callee | STRING | 100% | Callee extension or phone |
| callee_name | STRING | 100% | Callee display name (queue/person) |
| talk_time | STRING | 100% | HH:MM:SS talk duration |
| ring_duration | INT64 | 100% | Ring time in seconds |
| last_leg_disposition | STRING | 100% | Final leg outcome |
| missed | STRING | 100% | "Missed" or "-" |
| abandoned | STRING | 100% | "Abandoned" or "-" |
| answered | STRING | 100% | "Answered" or "-" |
| pbx_id | STRING | 100% | 8x8 PBX identifier |
| norm_caller_phone | STRING | ~3% | Normalized E.164 caller (only external) |
| norm_callee_phone | STRING | ~97% | Normalized E.164 callee |
| ingested_at | TIMESTAMP | 100% | Ingestion timestamp |

#### raw_call_legs (28,272 rows)
| Column | Type | Pop Rate | Description |
|--------|------|----------|-------------|
| call_id | STRING | 100% | Leg-level call ID |
| leg_id | STRING | 100% | Unique leg identifier |
| parent_call_id | STRING | ~46% | Parent CDR call_id (for internal legs) |
| start_time | TIMESTAMP | 100% | Leg start |
| disconnected_time | TIMESTAMP | 100% | Leg end |
| talk_time_ms | INT64 | ~32% | Talk time in ms |
| talk_time | STRING | 100% | HH:MM:SS format |
| caller | STRING | 100% | Caller for this leg |
| caller_name | STRING | ~99% | Caller display name |
| callee | STRING | 100% | Callee for this leg |
| callee_name | STRING | ~78% | Callee display name |
| direction | STRING | 100% | Internal/External |
| missed | STRING | 100% | Missed flag |
| answered | STRING | 100% | Answered flag |
| status | STRING | 100% | Leg status |
| cause | STRING | ~84% | Disconnect cause |
| caller_svc_name | STRING | ~47% | Service name (ring group etc) |
| caller_svc_type | STRING | ~47% | Service type |
| pbx_id | STRING | 100% | PBX identifier |
| ingested_at | TIMESTAMP | 100% | Ingestion timestamp |

#### raw_recordings (4,181 rows)
| Column | Type | Pop Rate | Description |
|--------|------|----------|-------------|
| recording_id | STRING | 100% | Unique recording ID |
| call_id | STRING | 100% | Associated call |
| created_at | TIMESTAMP | 100% | Recording creation time |
| direction | STRING | 100% | Call direction |
| duration_ms | INT64 | 100% | Recording duration ms |
| address | STRING | 100% | External phone involved |
| norm_address | STRING | 100% | Normalized phone |
| operator_name | STRING | ~95% | Operator who handled the call |
| operator_email | STRING | ~95% | Operator email |
| extension_number | STRING | ~95% | Operator extension |
| gcs_uri | STRING | 100% | GCS storage path for audio |
| ingested_at | TIMESTAMP | 100% | Ingestion timestamp |
| left_label | STRING | ~95% | Left channel speaker label |
| right_label | STRING | ~95% | Right channel speaker label |

#### call_transcripts (3,602 rows)
| Column | Type | Pop Rate | Description |
|--------|------|----------|-------------|
| call_id | STRING | 100% | Associated call |
| norm_address | STRING | ~95% | Normalized caller phone |
| direction | STRING | 100% | Call direction |
| call_start_time | TIMESTAMP | 100% | Call start time |
| total_duration_ms | INT64 | 100% | Transcript duration ms |
| segment_count | INT64 | 100% | Number of transcript segments |
| operators | STRING | ~95% | Operators identified |
| full_transcript | STRING | 100% | Full text transcript |
| first_transcribed_at | TIMESTAMP | 100% | When transcription completed |

#### raw_emails_received (74,743 rows)
| Column | Type | Pop Rate | Description |
|--------|------|----------|-------------|
| message_id | STRING | 100% | MS Graph message ID |
| conversation_id | STRING | 100% | Thread conversation ID |
| folder_name | STRING | 100% | Mailbox folder |
| direction | STRING | 100% | Always 'inbound' |
| received_at | TIMESTAMP | 100% | Receive timestamp |
| from_email | STRING | 100% | Sender address |
| from_name | STRING | 100% | Sender display name |
| to_email | STRING | 100% | Recipient address |
| subject | STRING | ~99% | Email subject |
| body_preview | STRING | ~100% | Truncated body preview |
| body_text | STRING | ~100% | Plain text body |
| body_html | STRING | ~100% | HTML body |
| has_attachments | BOOL | ~37% true | Has attachments flag |
| ingested_at | TIMESTAMP | 100% | Ingestion timestamp |

#### raw_emails_sent (42,392 rows)
Same schema as raw_emails_received (14 columns).

#### opportunities (38,342 rows)
| Column | Type | Pop Rate | Description |
|--------|------|----------|-------------|
| opportunity_id | STRING | 100% | J-{jn} or G-{hash} |
| phone | STRING | ~90% | Primary phone |
| jobnumber | STRING | ~40% | Primary linked job |
| job_task_type | STRING | ~40% | Job task type |
| job_status | STRING | ~40% | Job status |
| job_count | INT64 | 100% | Count of linked jobs |
| all_jobnumbers | STRING | ~40% | Comma-separated job numbers |
| opportunity_timestamp | TIMESTAMP | 100% | First touch time |
| opportunity_timestamp_sydney | DATETIME | 100% | Sydney local time |
| call_count | INT64 | 100% | Number of calls in cluster |
| form_count | INT64 | 100% | Number of forms in cluster |
| max_duration_sec | INT64 | ~80% | Longest call duration |
| opp_type | STRING | 100% | job_matched/gap_based/no_inbound |
| is_business_hours | BOOL | 100% | Business hours flag |
| attribution_source | STRING | ~60% | WC/form/direct |
| channel | STRING | ~60% | Marketing channel |
| source | STRING | ~60% | Traffic source |
| medium | STRING | ~60% | Traffic medium |
| campaign | STRING | ~25% | Campaign name |
| keyword | STRING | ~20% | Search keyword |
| profile | STRING | ~70% | PTTR/ETTR |
| wc_lead_id | INT64 | ~30% | Primary WC lead ID |
| direct_subtype | STRING | ~30% | Direct channel subtype |
| queue_ext | STRING | ~70% | Queue extension dialed |
| queue_name | STRING | ~70% | Queue name |
| contact_name | STRING | ~40% | Contact name |
| matched_phones | STRING | ~90% | All matched phones |
| matched_emails | STRING | ~20% | All matched emails |
| is_no_inbound_enquiry | BOOL | 100% | No inbound call/form |
| has_answered_call | BOOL | 100% | Has at least one answered call |
| is_existing_customer | BOOL | 100% | Prior jobs on same phone |

#### lead_interactions (3,137 rows)
| Column | Type | Pop Rate | Description |
|--------|------|----------|-------------|
| lead_id | INT64 | 100% | WC lead ID |
| contact_name | STRING | ~60% | Contact name from WC |
| lead_created | TIMESTAMP | 100% | Lead creation time |
| lead_created_syd | DATETIME | 100% | Sydney time |
| lead_source | STRING | 100% | WC lead source |
| lead_type | STRING | 100% | Phone Call/Web Form |
| contact_datetime | TIMESTAMP | 100% | Interaction timestamp |
| contact_datetime_sydney | DATETIME | 100% | Sydney time |
| contact_type | STRING | 100% | Phone/Email |
| direction | STRING | 100% | inbound/outbound |
| contact_from | STRING | ~95% | From address/phone |
| contact_to | STRING | ~95% | To address/phone |
| contact_subject | STRING | ~40% | Subject (emails) |
| contact_content | STRING | ~50% | Body content |
| call_id | STRING | ~60% | 8x8 call_id |
| gcs_uri | STRING | ~30% | Recording GCS path |
| operator_name | STRING | ~50% | Operator who handled |

#### lkp_did_trade (113 rows)
| Column | Type | Pop Rate |
|--------|------|----------|
| did | STRING | 100% |
| trade | STRING | 100% |
| label | STRING | 100% |
| is_internal | BOOL | 100% |

#### lkp_campaign (455 rows)
| Column | Type | Pop Rate |
|--------|------|----------|
| campaign_id | STRING | 100% |
| campaign_name | STRING | 100% |
| campaign_type | STRING | 100% |
| division | STRING | 100% |

#### crm_account_exclusions
| Column | Type | Pop Rate |
|--------|------|----------|
| opportunity_id | STRING | 100% |
| is_account | BOOL | 100% |
| provenance | STRING | 100% |
| synced_at | TIMESTAMP | 100% |

#### operator_extensions
| Column | Type | Pop Rate |
|--------|------|----------|
| extension | STRING | 100% |
| operator_name | STRING | 100% |

#### test_numbers
| Column | Type | Pop Rate |
|--------|------|----------|
| phone_e164 | STRING | 100% |
| note | STRING | 100% |
| reason | STRING | 100% |

#### vw_lead_enriched (view, 53 columns)
Key output columns: opportunity_id, created_at_sydney, is_after_hours, service, profile_source, lead_type, contact_name, phone, email, is_existing_customer, is_no_inbound_enquiry, suburb, form_address, form_problem, channel, source, medium, campaign_type, division, campaign_name, keyword, wc_lead_id, matched_phones, matched_emails, call_count, form_count, answered, captured, first_response_minutes, operator, job_numbers, all_jobnumbers, job_count, booking_status, invoiced_amount, estimated_sales, revenue, revenue_basis, revenue_source, multi_visit_flag, job_value, job_status, completed, funnel_stage, is_after_hours_gap, disposition, loss_reason, csr_quality, quotable, lead_class, confidence, reasoning, needs_review.

#### vw_leads_unified (view, 28 columns)
The event spine: lead_id, source_type, phone, lead_timestamp, lead_timestamp_sydney, duration_sec, queue_ext, queue_name, is_business_hours, attribution_source, wc_lead_id, channel, source, medium, campaign, keyword, profile, tracking_number, direct_subtype, call_outcome, answered, missed, talk_time, contact_name, email, form_suburb, form_address, form_problem.

---

### ds_aroflo (AroFlo job management)

#### tasks_deduped (73,723 rows, 72 columns)
| Column | Type | Pop Rate | Description |
|--------|------|----------|-------------|
| jobnumber | STRING | 100% | AroFlo job number |
| taskid | STRING | 100% | Internal task ID |
| taskname | STRING | 100% | Task description |
| tasktype | STRING | 100% | Task type code |
| tasktasktype_tasktype | STRING | 100% | Full task type name |
| tasktasktype_tasktypeid | STRING | 100% | Task type ID |
| status | STRING | 100% | Current status |
| substatus_substatus | STRING | ~0.5% | Substatus (rare) |
| substatus_substatusid | STRING | ~0.5% | Substatus ID |
| description | STRING | ~100% | Task description/body |
| client_clientid | STRING | 100% | Client ID |
| client_clientname | STRING | 100% | Client name |
| contact_userid | STRING | ~86% | Customer contact user ID |
| contact_givennames | STRING | ~86% | Contact first name |
| contact_surname | STRING | ~86% | Contact last name |
| contactname | STRING | 100% | CSR/staff contact (NOT customer) |
| contactphone | STRING | ~90% | CSR/staff phone (NOT customer) |
| location_locationid | STRING | ~2% | Location ID |
| location_locationname | STRING | ~2% | Location name |
| location_address | STRING | ~2% | Location address |
| location_suburb | STRING | ~2% | Location suburb |
| location_postcode | STRING | ~2% | Location postcode |
| location_state | STRING | ~2% | Location state |
| location_country | STRING | ~2% | Location country |
| location_gpslat | STRING | ~2% | GPS latitude |
| location_gpslong | STRING | ~2% | GPS longitude |
| location_SitePhone | STRING | ~0.5% | Site phone |
| location_SiteEmail | STRING | ~0.4% | Site email |
| location_SiteContact | STRING | ~0.5% | Site contact name |
| location_customfields | STRING | ~2% | Location custom fields |
| location_archived | STRING | ~2% | Location archived flag |
| tasklocation_locationid | STRING | ~98% | Task-level location ID |
| tasklocation_locationname | STRING | ~98% | Task-level location name |
| requestdate | STRING | 100% | Request date |
| requestdatetime | STRING | 100% | Request datetime |
| completeddate | STRING | ~100% | Completion date |
| completeddatetime | STRING | ~100% | Completion datetime |
| duedate | STRING | 100% | Due date |
| duedatetime | STRING | 100% | Due datetime |
| priority | STRING | 100% | Priority level |
| refcode | STRING | ~50% | Reference code |
| salesperson | STRING | ~80% | Salesperson |
| readtask | STRING | ~95% | Read flag |
| readtaskdatetime | STRING | ~95% | When task was read |
| quote_totalex | STRING | ~1% | Quote amount ex GST |
| quote_totalinc | STRING | ~1% | Quote amount inc GST |
| quote_totaltax | STRING | ~1% | Quote tax amount |
| quote_estimator_userid | STRING | ~1% | Quote estimator |
| quote_estimator_givennames | STRING | ~1% | Estimator first name |
| quote_estimator_surname | STRING | ~1% | Estimator surname |
| customfields | STRING | ~0% | Custom fields JSON (empty) |
| labours | STRING | ~0% | Labours JSON (empty in table) |
| materials | STRING | ~0% | Materials JSON (empty) |
| expenses | STRING | ~0% | Expenses JSON (empty) |
| purchaseorders | STRING | ~0% | Purchase orders JSON (empty) |
| assigneds | STRING | ~0% | Assigned users JSON (empty) |
| assets | STRING | ~0% | Assets JSON (empty) |
| documentsandphotos | STRING | 100% | Docs/photos reference |
| gpslatitude | STRING | ~97% | GPS latitude |
| gpslongitude | STRING | ~97% | GPS longitude |
| org_orgid | STRING | 100% | Organization ID |
| org_orgname | STRING | 100% | Organization name |
| custon | STRING | ~50% | Customer order number |
| createddatetimeutc | STRING | 100% | Created UTC |
| createdutc | STRING | 100% | Created timestamp |
| lastupdateddatetimeutc | STRING | 100% | Last updated UTC |
| lastupdatedutc | STRING | 100% | Last updated timestamp |
| linkprocessed | STRING | ~95% | Link processed flag |
| linkprocesseddate | STRING | ~95% | Link processed date |
| assetid | STRING | ~0% | Asset ID |
| tasknotes | STRING | ~90% | Inline task notes |

#### tasks_complete (73,723 rows)
| Column | Type | Pop Rate | Description |
|--------|------|----------|-------------|
| jobnumber | STRING | 100% | Job number |
| client_name | STRING | 100% | Client name |
| task | STRING | 100% | Task name |
| task_type | STRING | 100% | Task type |
| requested_date | STRING | 100% | Request date |
| completed_date | STRING | ~100% | Completion date |
| request_month | DATE | 100% | Request month |
| months_since_latest | FLOAT64 | 100% | Months since latest task |
| request_week | DATETIME | 100% | Request week |
| request_year | DATE | 100% | Request year |
| status | STRING | 100% | Status |
| display_status | STRING | 100% | Display status |
| job_status | STRING | 100% | Job status (Completed/etc) |
| customer_type | STRING | 100% | COD/Account |
| service_type | STRING | 100% | Service type |
| warranty_flag | STRING | ~5% | Warranty flag |
| id_email | STRING | ~30% | Client email |
| id_phone | STRING | ~90% | Client phone |
| address | STRING | ~90% | Job address |
| address_suburb | STRING | ~85% | Suburb |
| location_post_code | STRING | ~85% | Postcode |
| location | STRING | ~60% | Location name |
| task_invoices_total_ex | NUMERIC | ~70% | Invoice total (DEPRECATED) |
| last_invoice_date | STRING | ~70% | Last invoice date |
| description | STRING | ~100% | Job description |
| count_request | INT64 | 100% | Request count |
| count_completed | INT64 | 100% | Completed count |
| count_open | INT64 | 100% | Open count |
| count_archived | INT64 | 100% | Archived count |
| norm_client_email | STRING | ~30% | Normalized email |
| norm_client_mobile | STRING | ~60% | Normalized mobile |
| norm_client_phone | STRING | ~40% | Normalized phone |
| requested_date_parsed | DATE | 100% | Parsed request date |

#### tasklabours_raw (129,592 rows)
| Column | Type | Pop Rate | Description |
|--------|------|----------|-------------|
| lineid | STRING | 100% | Line item ID |
| task_jobnumber | STRING | 100% | Associated job number |
| task_taskid | STRING | 100% | Task ID |
| user_userid | STRING | 100% | Tech user ID |
| user_username | STRING | 100% | Tech username |
| workdate | STRING | 100% | Work date |
| workdatetimestart | STRING | ~95% | Work start datetime |
| workdatetimeend | STRING | ~95% | Work end datetime |
| starttime | STRING | ~95% | Start time |
| endtime | STRING | ~95% | End time |
| hours | STRING | 100% | Hours worked |
| cost | STRING | 100% | Labour cost |
| sell | STRING | 100% | Labour sell price |
| worktype | STRING | 100% | Work type |
| note | STRING | ~80% | Labour note (revenue signal) |
| deleted | STRING | ~5% | Deleted flag |
| deleteddate | STRING | ~5% | Deletion date |
| deleteddatetime | STRING | ~5% | Deletion datetime |
| deletedtime | STRING | ~5% | Deletion time |
| labeodapproved | STRING | ~90% | EOD approved flag |
| lablinkprocessed | STRING | ~90% | Link processed |
| lablinkprocesseddate | STRING | ~90% | Link processed date |
| lablinkprocesseddatetime | STRING | ~90% | Link processed datetime |
| lablocked | STRING | 100% | Locked flag |
| labverified | STRING | ~80% | Verified flag |
| task_client_clientid | STRING | 100% | Client ID |
| task_client_clientname | STRING | 100% | Client name |
| task_org_orgid | STRING | 100% | Org ID |
| task_org_orgname | STRING | 100% | Org name |
| task_status | STRING | 100% | Task status |
| task_refcode | STRING | ~50% | Reference code |
| task_linkprocessed | STRING | ~90% | Task link processed |
| task_linkprocesseddate | STRING | ~90% | Task link processed date |
| task_webappEncodedID | STRING | 100% | Web app encoded ID |

#### task_notes_deduped (107,220 rows)
| Column | Type | Pop Rate | Description |
|--------|------|----------|-------------|
| noteid | STRING | 100% | Note ID |
| taskid | STRING | 100% | Task ID |
| jobnumber | STRING | 100% | Job number |
| dateposted | STRING | 100% | Date posted |
| timeposted | STRING | 100% | Time posted |
| username | STRING | 100% | User who posted |
| userid | STRING | 100% | User ID |
| filter | STRING | 100% | Note filter/type |
| sticky | STRING | 100% | Sticky note flag |
| note_raw | STRING | 100% | Raw HTML note |
| note_clean | STRING | 100% | Cleaned plain text |
| ingested_at | TIMESTAMP | 100% | Ingestion timestamp |

#### contacts_deduped (31,523 rows)
| Column | Type | Pop Rate | Description |
|--------|------|----------|-------------|
| contactid | STRING | 100% | Contact ID |
| clientid | STRING | 100% | Client ID |
| clientname | STRING | ~95% | Client name |
| firstname | STRING | ~95% | First name |
| lastname | STRING | ~95% | Last name |
| username | STRING | ~95% | Username |
| userid | STRING | 100% | User ID (join key) |
| email | STRING | ~36% | Primary email |
| email2 | STRING | ~0.2% | Secondary email |
| phone | STRING | ~48% | Phone number |
| mobile | STRING | ~75% | Mobile number |
| fax | STRING | ~6% | Fax number |
| contacttype | STRING | 100% | Contact type |
| accesstype | STRING | 100% | Access type |
| notes | STRING | 100% | Notes |
| org_orgid | STRING | 100% | Org ID |
| org_orgname | STRING | 100% | Org name |
| createdutc | STRING | 100% | Created UTC |
| createddatetimeutc | STRING | 100% | Created datetime |
| archived | STRING | 100% | Archived flag |
| ingested_at | STRING | 100% | Ingestion timestamp |

#### locations_deduped (17,284 rows)
| Column | Type | Pop Rate | Description |
|--------|------|----------|-------------|
| locationid | STRING | 100% | Location ID |
| locationname | STRING | 100% | Location name |
| address | STRING | ~95% | Full address |
| suburb | STRING | ~90% | Suburb |
| postcode | STRING | ~90% | Postcode |
| state | STRING | ~90% | State |
| country | STRING | ~90% | Country |
| gpslat | STRING | ~80% | GPS latitude |
| gpslong | STRING | ~80% | GPS longitude |
| SiteContact | STRING | ~15% | Site contact name |
| SitePhone | STRING | ~10% | Site phone |
| SiteEmail | STRING | ~8% | Site email |
| linkedto_linkedtoid | STRING | 100% | Linked client/org ID |
| linkedto_linkedtoname | STRING | 100% | Linked entity name |
| linkedto_linkedtotype | STRING | 100% | Linked entity type |
| notes | STRING | ~20% | Location notes |
| customfields | STRING | ~10% | Custom fields |
| documentsandphotos | STRING | ~5% | Docs/photos |
| archived | STRING | 100% | Archived flag |
| createdutc | STRING | 100% | Created UTC |
| createddatetimeutc | STRING | 100% | Created datetime |
| lastupdatedutc | STRING | 100% | Last updated UTC |
| lastupdateddatetimeutc | STRING | 100% | Last updated datetime |

#### invoices_deduped (64,328 rows)
| Column | Type | Pop Rate | Description |
|--------|------|----------|-------------|
| invoiceid | STRING | 100% | Invoice ID |
| invoicenumber | STRING | 100% | Invoice number |
| task_jobnumber | STRING | 100% | Job number |
| task_taskid | STRING | 100% | Task ID |
| task_taskname | STRING | 100% | Task name |
| task_tasktype | STRING | 100% | Task type |
| status | STRING | 100% | Invoice status |
| totalex | STRING | 100% | Total ex GST |
| totalgst | STRING | 100% | GST amount |
| totalinc | STRING | 100% | Total inc GST |
| dateinvoiced | STRING | 100% | Invoice date |
| duedate | STRING | 100% | Due date |
| description | STRING | ~80% | Invoice description |
| notes | STRING | ~20% | Invoice notes |
| lines | STRING | 100% | Line items JSON |
| isTaxInclusive | STRING | 100% | Tax inclusive flag |
| partinvoice | STRING | ~5% | Part invoice flag |
| surchargeamount | STRING | ~5% | Surcharge amount |
| deliverystatus | STRING | ~30% | Delivery status |
| invoiceurl | STRING | 100% | Invoice URL |
| invoicedbyuser_userid | STRING | 100% | Invoiced by user |
| invoicedbyuser_username | STRING | 100% | Invoiced by username |
| client_orgid | STRING | 100% | Client org ID |
| client_orgname | STRING | 100% | Client org name |
| org_orgid | STRING | 100% | Organization ID |
| org_orgname | STRING | 100% | Organization name |
| link_orgid | STRING | ~30% | Linked org ID |
| link_orgname | STRING | ~30% | Linked org name |
| link_externalid | STRING | ~30% | External link ID |
| linkprocesseddate | STRING | ~30% | Link processed date |
| task_refcode | STRING | ~50% | Reference code |
| task_requestdate | STRING | 100% | Task request date |
| task_requestdatetime | STRING | 100% | Task request datetime |
| task_completeddate | STRING | ~95% | Task completed date |
| task_completeddatetime | STRING | ~95% | Task completed datetime |
| task_webappEncodedID | STRING | 100% | Web app ID |
| createdutc | STRING | 100% | Created UTC |
| createddatetimeutc | STRING | 100% | Created datetime |
| lastupdatedutc | STRING | 100% | Last updated UTC |
| lastupdateddatetimeutc | STRING | 100% | Last updated datetime |
| lastupdateuser_userid | STRING | 100% | Last update user |
| lastupdateuser_username | STRING | 100% | Last update username |
| custon | STRING | ~50% | Customer order number |
| documentsandphotos | STRING | ~80% | Docs/photos |

#### vw_job_invoiced (view)
| Column | Type | Description |
|--------|------|-------------|
| jobnumber | STRING | Job number |
| invoiced_total_ex | FLOAT64 | Sum of line-level invoices ex GST |
| invoice_count | INT64 | Number of invoices |
| credit_note_count | INT64 | Number of credit notes |

#### task_customfields_deduped (referenced by queries.ts)
| Column | Type | Description |
|--------|------|-------------|
| taskid | STRING | Task ID |
| jobnumber | STRING | Job number |
| primary_work_type | STRING | Primary work type category |
| service_fee_minimum_charge | STRING | Service fee |
| substatus | STRING | Substatus |
| campaign_most_popular | STRING | Campaign (most popular) |
| campaign_least_popular | STRING | Campaign (least popular) |
| other_work_type_1 | STRING | Secondary work type |
| other_work_type_2 | STRING | Tertiary work type |
| happy_call_grade | STRING | Happy call grade |
| happy_call_details | STRING | Happy call details |
| (+ 16 more audit/inspection fields) | STRING | Various QA fields |

---

### gd_WhatConverts (1,305 rows in all_leads_enriched / all_leads_classified)

#### all_leads_enriched (81 columns)
| Column | Type | Pop Rate | Description |
|--------|------|----------|-------------|
| lead_id | INT64 | 100% | WC lead ID |
| account_id | INT64 | 100% | WC account ID |
| profile_id | INT64 | 100% | WC profile ID |
| profile | STRING | 100% | PTTR/ETTR profile name |
| lead_type | STRING | 100% | Phone Call/Web Form |
| lead_status | STRING | 100% | WC lead status |
| date_created | TIMESTAMP | 100% | Lead creation timestamp |
| last_updated | TIMESTAMP | 100% | Last update time |
| duplicate | BOOL | 0% | Duplicate flag |
| spam | BOOL | 0% | Spam flag |
| quotable | STRING | 100% | Quotable classification |
| quote_value | FLOAT64 | 0% | Quote value (never populated) |
| sales_value | FLOAT64 | ~18% | Actual sales value |
| spotted_keywords | STRING | 0% | Spotted keywords (never populated) |
| lead_score | FLOAT64 | 100% | WC lead score |
| notes | STRING | ~1% | Notes |
| contact_name | STRING | ~54% | Contact name |
| contact_company_name | STRING | <1% | Company name |
| contact_email_address | STRING | ~24% | Contact email |
| contact_phone_number | STRING | ~81% | Contact phone |
| lead_source | STRING | 100% | Traffic source |
| lead_medium | STRING | 100% | Traffic medium |
| lead_campaign | STRING | ~3% | Campaign name |
| lead_content | STRING | ~2% | Ad content |
| lead_keyword | STRING | ~25% | Search keyword |
| lead_url | STRING | ~77% | Referring URL |
| landing_url | STRING | ~77% | Landing page URL |
| email_address | STRING | ~19% | Email address |
| phone_number | STRING | ~87% | Phone number |
| tracking_number | STRING | ~63% | WC tracking number |
| destination_number | STRING | ~63% | Destination number |
| caller_number | STRING | ~87% | Caller number |
| caller_name | STRING | ~60% | Caller name (CNAM) |
| call_duration_seconds | INT64 | ~63% | Call duration |
| city | STRING | ~43% | City/suburb |
| state | STRING | ~37% | State |
| zip | STRING | ~35% | Postcode |
| country | STRING | ~96% | Country |
| gclid | STRING | ~35% | Google Click ID |
| msclkid | STRING | 0% | Bing Click ID (never) |
| user_id | STRING | ~76% | WC user ID |
| form_job_number | STRING | ~30% | Job number (from classification) |
| form_lead_status | STRING | 100% | Form lead status |
| form_reason_did_not_convert | STRING | 100% | Reason did not convert |
| form_reason_did_not_convert_detail | STRING | ~35% | Detail reason |
| form_service_type | STRING | ~47% | Service type |
| form_book_a_job | STRING | ~8% | Book-a-job intent |
| form_date | STRING | ~8% | Requested date |
| form_my_problem | STRING | ~13% | Problem description |
| form_my_address | STRING | ~8% | Customer address |
| form_my_email | STRING | ~10% | Customer email |
| form_my_name | STRING | ~24% | Customer name |
| form_my_phone | STRING | ~20% | Customer phone |
| form_time | STRING | ~8% | Requested time |
| additional_fields_json | STRING | 100% | All WC additional fields (JSON object) |
| custom_fields_json | STRING | 100% | WC custom fields (JSON object) |
| field_mappings_json | STRING | 0% | Field mappings (empty) |
| lead_analysis_json | STRING | 100%* | Lead analysis (always empty `[]`) |
| customer_journey_json | STRING | 0% | Customer journey (never populated) |
| raw_json | STRING | 100% | Full raw WC API response |
| call_transcription | STRING | ~59% | WC call transcription |
| voicemail_transcription | STRING | 0% | Voicemail transcription (never) |
| lp_keyword | STRING | ~22% | Landing page keyword param |
| lp_gclid | STRING | ~36% | Landing page gclid param |
| lp_gad_campaignid | STRING | ~38% | Landing page campaign ID |
| lp_campaign_id | STRING | <1% | Alternative campaign ID |
| lp_gad_source | STRING | ~38% | Landing page ad source |
| lp_gbraid | STRING | ~32% | Google gbraid param |
| gads_matched_campaign_id | INT64 | ~38% | Matched campaign ID (via join) |
| norm_contact_email | STRING | ~19% | Normalized contact email |
| norm_form_email | STRING | ~10% | Normalized form email |
| norm_email | STRING | ~19% | Best normalized email |
| norm_contact_phone | STRING | ~81% | Normalized contact phone |
| norm_phone | STRING | ~76% | Best normalized phone |
| norm_caller_phone | STRING | ~87% | Normalized caller phone |
| norm_form_phone | STRING | ~20% | Normalized form phone |
| id_email | STRING | ~24% | Identity email |
| id_phone | STRING | ~82% | Identity phone |
| is_test_lead | BOOL | ~8% | Test lead flag |
| id_combined_sales | NUMERIC | ~17% | Combined sales from phone match |
| id_combined_jobnumbers | STRING | ~30% | Combined job numbers |
| lead_date_date | DATE | 100% | Lead date (date only) |
| has_sales | BOOL | ~17% | Has sales flag |
| has_jobs | BOOL | ~30% | Has jobs flag |
| enriched_at | TIMESTAMP | 100% | Enrichment timestamp |

**additional_fields_json keys** (62 unique keys found):
- Form fields: `Address*`, `Email*`, `How Can We Help?*`, `Name*`, `Phone*`, `Postcode*`, `How can we help? *`, `My name is *`, `My phone number is *`, `My email is *`, `My address is *`, `My problem is *`, `My question is *`, `Ask a question`, `Book a job`, `Request a call back`, `Service Required (optional)`, `Your Name *`, `Suburb / Postcode *`
- Classification fields: `Address`, `Post Code`, `Reason for Call / Job`, `Reason Did Not Convert`, `Reason Did Not Convert - Detail`, `Lead Status`, `Job Number`, `Service Type`
- WPForms numeric IDs: `wpforms - fields - 1` through `wpforms - fields - 20`
- Chinese translations: same form fields in Chinese characters
- Temporal: `Date`, `Time`

**custom_fields_json keys** (always same 7 keys, usually empty values):
Address, Post Code, Reason for Call / Job, Reason Did Not Convert - Detail, Reason Did Not Convert, Lead Status, Job Number

#### all_leads_classified (same 81 columns as enriched plus classification)
Adds: `lead_class`, `is_test_lead`, `is_repeat_lead`, `is_unique_lead`, `is_pending`, `is_unbooked`, `is_booking`, `is_unconverted_job`, `is_pending_job`, `is_converted_job`, `classified_at`, `date_created_utc`, `date_created_sydney`, `lead_date`, `lead_hour_sydney`, `lead_month`, `lead_week`, `lead_day_of_week`, `business_hours_flag`.

---

## Part 2: Consumed Columns (by source file)

### 1. classify.ts (Classifier Input Assembly)

| Table | Columns Used |
|-------|-------------|
| ds_crm.vw_lead_enriched | lead_type, channel, source, service, answered, captured, is_after_hours, booking_status, completed, job_count, is_existing_customer, contact_name, phone, suburb |
| ds_crm.raw_calls | call_id, talk_time |
| ds_crm.call_transcripts | call_id, full_transcript |
| ds_crm.vw_leads_unified | lead_id, wc_lead_id |
| gd_WhatConverts.all_leads_enriched | lead_id, call_transcription |
| ds_crm.raw_emails_received | message_id, body_preview, body_text |
| ds_crm.raw_emails_sent | message_id, body_preview, body_text |
| ds_aroflo.tasks_deduped | jobnumber, description |
| ds_aroflo.tasklabours_raw | task_jobnumber, note, workdate, lineid, deleted |
| ds_aroflo.task_notes_deduped | jobnumber, dateposted, note_clean |

### 2. sql.ts (Interaction Timeline SQL)

| Table | Columns Used |
|-------|-------------|
| ds_crm.lead_interactions | call_id, lead_id, contact_type, direction, contact_datetime_sydney, contact_subject, contact_content, operator_name |
| ds_crm.raw_calls | call_id, start_time, direction, caller, callee, callee_name, talk_time, norm_caller_phone, norm_callee_phone |
| ds_crm.raw_call_legs | parent_call_id, callee_name, callee, answered, direction, start_time, disconnected_time |
| ds_crm.raw_recordings | call_id, operator_name |
| ds_crm.lkp_did_trade | did, label |
| ds_crm.raw_emails_received | message_id, conversation_id, received_at, from_email, from_name, to_email, subject, body_preview, body_text |
| ds_crm.raw_emails_sent | message_id, received_at, from_email, from_name, to_email, subject, body_preview, body_text |
| ds_crm.vw_leads_unified | lead_id, source_type, phone, lead_timestamp, lead_timestamp_sydney, wc_lead_id, form_problem, contact_name |
| gd_WhatConverts.all_leads_enriched | lead_id, lead_type, date_created, form_my_problem |

### 3. resolve.ts (Anchor Resolution)

| Table | Columns Used |
|-------|-------------|
| ds_crm.opportunities | opportunity_id, matched_phones, matched_emails, wc_lead_id, opportunity_timestamp, all_jobnumbers |

### 4. queries.ts (UI Queries)

| Table | Columns Used |
|-------|-------------|
| ds_crm.vw_lead_enriched | opportunity_id, created_at_sydney, channel, service, contact_name, phone, email, suburb, source, medium, campaign_name, keyword, funnel_stage, is_after_hours, call_count, form_count, operator, is_existing_customer, job_value, wc_lead_id, booking_status, completed, answered, captured, lead_type, campaign_type, all_jobnumbers, job_count, is_after_hours_gap, matched_phones, matched_emails, is_no_inbound_enquiry |
| ds_crm.vw_accounts | * (all columns) |
| ds_crm.vw_account_locations | * (all columns) |
| ds_crm.vw_contacts | * (all columns) |
| ds_crm.vw_contact_timeline | * (all columns) |
| ds_crm.vw_tasks | * (all columns) |
| ds_crm.vw_search | * (all columns) |
| ds_crm.opportunities | opportunity_id, all_jobnumbers, matched_phones, phone, is_existing_customer, wc_lead_id |
| ds_crm.lead_interactions | lead_id, call_id, contact_type, direction, contact_datetime, contact_datetime_sydney, contact_from, contact_to, contact_subject, contact_content, operator_name, gcs_uri |
| ds_crm.raw_calls | call_id, caller, start_time, talk_time, callee_name, norm_caller_phone |
| ds_crm.raw_call_legs | parent_call_id, callee_name, callee, answered, direction, start_time, disconnected_time |
| ds_crm.call_transcripts | call_id, full_transcript |
| ds_crm.raw_recordings | call_id, gcs_uri, operator_name |
| ds_crm.crm_account_exclusions | opportunity_id |
| gd_WhatConverts.all_leads_enriched | lead_id, call_transcription, raw_json ($.recording), lead_source, lead_medium, lead_type, profile, contact_name, norm_phone, city, date_created, contact_phone_number, contact_email_address, form_my_name, form_my_phone, form_my_email, form_my_address, form_my_problem, form_service_type, form_date, form_time, form_book_a_job, lead_keyword, landing_url, lead_url, state, country, call_duration_seconds |
| ds_aroflo.tasks_complete | jobnumber, client_name, task_type, status, job_status, display_status, customer_type, id_phone, norm_client_mobile, norm_client_email, address_suburb, requested_date |
| ds_aroflo.tasks_deduped | jobnumber, requestdate, duedate, tasktasktype_tasktype, status, client_clientname, client_clientid, location_locationname, location_address, location_suburb, tasklocation_locationname, description, quote_totalex |
| ds_aroflo.vw_job_invoiced | jobnumber, invoiced_total_ex |
| ds_aroflo.tasklabours_raw | task_jobnumber, note, workdate, lineid, deleted, user_username, worktype, hours, cost, sell |
| ds_aroflo.task_notes_deduped | jobnumber, username, dateposted, timeposted, filter, note_clean |
| ds_aroflo.task_customfields_deduped | jobnumber, primary_work_type |

### 5. leads/route.ts (Leads API)

| Table | Columns Used |
|-------|-------------|
| gd_WhatConverts.all_leads_enriched | lead_id, lead_source, lead_medium, lead_type, profile, contact_name, norm_phone, city |
| ds_aroflo.tasks_complete | jobnumber, client_name, task_type, status, job_status, display_status, customer_type, norm_client_email |
| ds_aroflo.tasks_deduped | jobnumber, location_suburb, tasklocation_locationname |
| ds_aroflo.vw_job_invoiced | jobnumber, invoiced_total_ex |

### 6. leads/[id]/interaction/route.ts (Interaction Detail)

| Table | Columns Used |
|-------|-------------|
| ds_crm.raw_calls | call_id, start_time, caller, callee_name, talk_time, norm_caller_phone |
| ds_crm.call_transcripts | call_id, full_transcript |
| ds_crm.raw_call_legs | parent_call_id, callee_name, callee, answered, direction, start_time, disconnected_time |
| ds_crm.raw_recordings | call_id, gcs_uri, operator_name |
| ds_crm.lead_interactions | lead_id, call_id, contact_type, contact_datetime, contact_datetime_sydney, contact_from, contact_to, contact_subject, contact_content, operator_name, gcs_uri |
| ds_crm.raw_emails_received | message_id, received_at, from_email, to_email, subject, body_preview, body_text |
| ds_crm.raw_emails_sent | message_id, received_at, from_email, to_email, subject, body_preview, body_text |
| ds_crm.vw_leads_unified | lead_id, wc_lead_id |
| gd_WhatConverts.all_leads_enriched | lead_id, call_transcription, raw_json ($.recording), lead_type, date_created, call_duration_seconds, contact_name, contact_phone_number, contact_email_address, form_my_name, form_my_phone, form_my_email, form_my_address, form_my_problem, form_service_type, form_date, form_time, form_book_a_job, city, state, country, lead_source, lead_medium, lead_keyword, landing_url, lead_url |

### 7. leads/[id]/interactions/route.ts (Interactions List)

Delegates entirely to `resolveAnchors()` + `assembleTouches()` from the shared interactions library (covered in files 2 and 3 above).

---

## Part 3: The Diff (Unused Columns)

### gd_WhatConverts.all_leads_enriched — UNUSED columns

| Column | Type | Pop Rate | Description | Relevance |
|--------|------|----------|-------------|-----------|
| **call_transcription** | STRING | 59% | WC call transcript text | **CONSUMED** (via classify.ts and interaction detail) |
| **raw_json** | STRING | 100% | Full WC API response blob | **PARTIALLY CONSUMED** (only `$.recording` key extracted) |
| additional_fields_json | STRING | 100% | Form field values (62 keys) | **HIGH** — contains full form submission text, addresses, problems, Chinese-language submissions. Currently only accessed via the named form_* columns. Unique keys like "How Can We Help?*", "My question is *" hold content not in form_my_problem. |
| customer_journey_json | STRING | 0% | Customer journey data | LOW — never populated |
| field_mappings_json | STRING | 0% | Field mappings | LOW — never populated |
| lead_analysis_json | STRING | 100%* | Lead analysis | LOW — always empty `[]` |
| custom_fields_json | STRING | 100% | Classification custom fields (7 keys) | MEDIUM — holds Address, Post Code, Reason for Call / Job, Job Number, Lead Status, Reason Did Not Convert. Mostly duplicates form_* columns but "Reason for Call / Job" is UNIQUE content. |
| voicemail_transcription | STRING | 0% | Voicemail transcript | LOW — never populated |
| spotted_keywords | STRING | 0% | Spotted keywords | LOW — never populated |
| quote_value | FLOAT64 | 0% | Quote value | LOW — never populated |
| msclkid | STRING | 0% | Bing click ID | LOW — never populated |
| lp_campaign_id | STRING | <1% | Alternative campaign ID | LOW — near empty |
| lp_gbraid | STRING | 32% | Google gbraid param | MEDIUM — cross-device attribution signal. Not used but could verify attribution. |
| norm_contact_phone | STRING | 81% | Normalized contact phone | LOW — redundant with norm_phone |
| norm_caller_phone | STRING | 87% | Normalized caller phone | LOW — redundant with norm_phone |
| norm_form_phone | STRING | 20% | Normalized form phone | LOW — redundant with norm_phone |
| norm_contact_email | STRING | 19% | Normalized contact email | LOW — redundant with norm_email |
| norm_form_email | STRING | 10% | Normalized form email | LOW — redundant with norm_email |
| id_combined_sales | NUMERIC | 17% | Combined sales from phone match | MEDIUM — pre-computed revenue by identity |
| id_combined_jobnumbers | STRING | 30% | Combined job numbers | MEDIUM — pre-computed job linkage |
| has_sales | BOOL | 17% | Has sales flag | LOW — derived from id_combined_sales |
| has_jobs | BOOL | 30% | Has jobs flag | LOW — derived from id_combined_jobnumbers |
| lead_date_date | DATE | 100% | Lead date | LOW — derivable from date_created |
| enriched_at | TIMESTAMP | 100% | Enrichment timestamp | LOW — audit field |
| is_test_lead | BOOL | 8% | Test lead flag | LOW — already excluded upstream |
| user_id | STRING | 76% | WC browser user ID | MEDIUM — could help with cross-session identity resolution |
| account_id | INT64 | 100% | WC account ID | LOW — single-account setup |
| profile_id | INT64 | 100% | WC profile ID | LOW — derivable from profile |
| last_updated | TIMESTAMP | 100% | WC last update | LOW — audit field |
| duplicate | BOOL | 0% | Duplicate flag | LOW — never true |
| spam | BOOL | 0% | Spam flag | LOW — never true |
| lead_score | FLOAT64 | 100% | WC lead score | MEDIUM — could be used for prioritization but scoring logic is opaque |
| lead_content | STRING | 2% | Ad content | LOW — very sparse |
| email_address | STRING | 19% | Raw email address | LOW — redundant with norm_email |
| phone_number | STRING | 87% | Raw phone number | LOW — redundant with norm_phone |
| tracking_number | STRING | 63% | WC tracking number | MEDIUM — identifies which WC tracking number was dialed (maps to DID) |
| destination_number | STRING | 63% | Destination number | MEDIUM — the actual number the call was forwarded to |
| caller_number | STRING | 87% | Raw caller number | LOW — redundant with norm_phone |
| caller_name | STRING | 60% | CNAM lookup result | **HIGH** — caller ID name, often populated when contact_name is not. Could enrich contact resolution. |
| landing_url | STRING | 77% | Landing page URL | MEDIUM — landing page analysis for attribution |
| lead_url | STRING | 77% | Referring page URL | MEDIUM — referrer analysis |
| gclid | STRING | 35% | Raw Google click ID | LOW — used via lp_gclid |
| id_email | STRING | 24% | Best identity email | LOW — redundant (used in spine) |
| id_phone | STRING | 82% | Best identity phone | LOW — redundant (used in spine) |
| form_lead_status | STRING | 100% | WC form lead status | MEDIUM — WC's own lead classification |
| form_reason_did_not_convert | STRING | 100% | WC reason not converted | **HIGH** — human classification from WC. Holds "Booked", "Unbooked", "Pending" etc. Could seed CRM classification. |
| form_reason_did_not_convert_detail | STRING | 35% | Detail on non-conversion | **HIGH** — detailed reason text (e.g. "Already booked elsewhere", "Price too high"). Rich classification signal. |
| form_job_number | STRING | 30% | Job number from WC classification | **HIGH** — direct JN linkage from WC human classifiers. Could validate/supplement opportunity clustering. |
| quotable | STRING | 100% | WC quotable classification | **HIGH** — human judgment on whether the lead was quotable. Directly maps to CRM's "Not Quotable" funnel stage. |
| notes | STRING | 1% | WC notes | MEDIUM — free-text notes from WC classifiers |

### gd_WhatConverts.all_leads_classified — UNUSED columns (beyond enriched)

| Column | Type | Pop Rate | Description | Relevance |
|--------|------|----------|-------------|-----------|
| lead_class | STRING | 100% | WC classification label | **HIGH** — full WC lead classification. Maps to CRM funnel stages. |
| is_repeat_lead | INT64 | varies | Repeat lead flag | MEDIUM — could identify returning customers |
| is_unique_lead | INT64 | varies | Unique lead flag | MEDIUM — dedup signal |
| is_pending | INT64 | varies | Pending flag | MEDIUM — WC pending status |
| is_unbooked | INT64 | varies | Unbooked flag | MEDIUM — WC not-booked status |
| is_booking | INT64 | varies | Booking flag | **HIGH** — WC says this is a booking |
| is_unconverted_job | INT64 | varies | Unconverted job flag | MEDIUM — job that didn't convert |
| is_pending_job | INT64 | varies | Pending job flag | MEDIUM — pending job |
| is_converted_job | INT64 | varies | Converted job flag | **HIGH** — WC says job converted |
| classified_at | TIMESTAMP | varies | Classification timestamp | LOW — audit |
| date_created_utc | TIMESTAMP | 100% | UTC create time | LOW — duplicate of date_created |
| date_created_sydney | DATETIME | 100% | Sydney create time | LOW — derivable |
| lead_date | DATE | 100% | Lead date | LOW — derivable |
| lead_hour_sydney | INT64 | 100% | Hour of day | MEDIUM — time-of-day analysis |
| lead_month | STRING | 100% | Month label | LOW — derivable |
| lead_week | STRING | 100% | Week label | LOW — derivable |
| lead_day_of_week | STRING | 100% | Day of week | MEDIUM — day-of-week patterns |
| business_hours_flag | STRING | 100% | Business hours flag | MEDIUM — matches CRM is_after_hours |

### ds_crm.raw_calls — UNUSED columns

| Column | Type | Pop Rate | Description | Relevance |
|--------|------|----------|-------------|-----------|
| disconnected_time | TIMESTAMP | 100% | Call end time | MEDIUM — could compute duration directly |
| caller_name | STRING | 100% | Caller display label | MEDIUM — often shows the DID label for inbound |
| ring_duration | INT64 | 100% | Ring time before answer | **HIGH** — response time metric. Could feed first_response_minutes. |
| last_leg_disposition | STRING | 100% | Final disposition code | MEDIUM — detailed outcome (complement to answered/missed) |
| missed | STRING | 100% | Missed flag | LOW — redundant with answered |
| abandoned | STRING | 100% | Abandoned flag | MEDIUM — distinct from missed (caller hung up during ring) |
| pbx_id | STRING | 100% | PBX identifier | LOW — single PBX |
| ingested_at | TIMESTAMP | 100% | Ingestion time | LOW — audit |

### ds_crm.raw_call_legs — UNUSED columns

| Column | Type | Pop Rate | Description | Relevance |
|--------|------|----------|-------------|-----------|
| leg_id | STRING | 100% | Unique leg ID | LOW — internal |
| talk_time_ms | INT64 | 32% | Talk time in ms | LOW — redundant with talk_time |
| talk_time | STRING | 100% | HH:MM:SS format | LOW — not used directly from legs |
| caller | STRING | 100% | Leg caller | LOW — used for filtering only |
| caller_name | STRING | 99% | Leg caller name | LOW — not surfaced |
| missed | STRING | 100% | Missed flag | LOW — filtering only |
| status | STRING | 100% | Leg status | LOW — filtering only |
| cause | STRING | 84% | Disconnect cause | MEDIUM — could explain dropped calls |
| caller_svc_name | STRING | 47% | Service name | MEDIUM — ring group/AA identification |
| caller_svc_type | STRING | 47% | Service type | LOW — redundant with svc_name |
| pbx_id | STRING | 100% | PBX ID | LOW — single PBX |
| ingested_at | TIMESTAMP | 100% | Ingestion time | LOW — audit |

### ds_crm.raw_recordings — UNUSED columns

| Column | Type | Pop Rate | Description | Relevance |
|--------|------|----------|-------------|-----------|
| recording_id | STRING | 100% | Recording unique ID | LOW — internal |
| created_at | TIMESTAMP | 100% | Recording time | LOW — derivable from call |
| direction | STRING | 100% | Call direction | LOW — redundant |
| duration_ms | INT64 | 100% | Recording duration | MEDIUM — actual recording length (vs talk_time) |
| address | STRING | 100% | Raw phone | LOW — redundant with norm_address |
| norm_address | STRING | ~95% | Normalized phone | LOW — not used from this table |
| operator_email | STRING | ~95% | Operator email | LOW — operator resolved via name |
| extension_number | STRING | ~95% | Extension | LOW — operator resolved via name |
| left_label | STRING | ~95% | Left channel label | LOW — transcription metadata |
| right_label | STRING | ~95% | Right channel label | LOW — transcription metadata |
| ingested_at | TIMESTAMP | 100% | Ingestion time | LOW — audit |

### ds_crm.raw_emails_received — UNUSED columns

| Column | Type | Pop Rate | Description | Relevance |
|--------|------|----------|-------------|-----------|
| folder_name | STRING | 100% | Mailbox folder | LOW — internal routing |
| direction | STRING | 100% | Always 'inbound' | LOW — redundant |
| body_html | STRING | ~100% | Full HTML body | MEDIUM — richer content than body_text for form parsing |
| has_attachments | BOOL | ~37% | Attachments flag | LOW — not currently relevant |
| ingested_at | TIMESTAMP | 100% | Ingestion time | LOW — audit |

### ds_crm.raw_emails_sent — UNUSED columns

Same as raw_emails_received: folder_name, direction, body_html, has_attachments, ingested_at.

### ds_aroflo.tasks_deduped — UNUSED columns

| Column | Type | Pop Rate | Description | Relevance |
|--------|------|----------|-------------|-----------|
| taskid | STRING | 100% | Internal task ID | LOW — jobnumber is the key |
| taskname | STRING | 100% | Task name/title | MEDIUM — summary text, overlaps description |
| tasktype | STRING | 100% | Task type code | LOW — tasktasktype_tasktype is used instead |
| contact_givennames | STRING | 86% | Customer contact first name | **HIGH** — customer identity. Could enrich contact_name resolution. |
| contact_surname | STRING | 86% | Customer contact last name | **HIGH** — customer identity. |
| contact_userid | STRING | 86% | Customer contact user ID | **CONSUMED** (used in build_opportunities.sql via join to contacts_deduped) |
| contactname | STRING | 100% | CSR/staff name (NOT customer) | LOW — staff, not customer |
| contactphone | STRING | 90% | CSR/staff phone (NOT customer) | LOW — staff, not customer |
| location_locationid | STRING | 2% | Embedded location ID | LOW — rarely populated |
| location_locationname | STRING | 2% | Embedded location name | LOW — rarely populated |
| location_address | STRING | 2% | Embedded address | LOW — rarely populated |
| location_postcode | STRING | 2% | Embedded postcode | LOW — rarely populated |
| location_state | STRING | 2% | Embedded state | LOW — rarely populated |
| location_country | STRING | 2% | Embedded country | LOW — rarely populated |
| location_gpslat | STRING | 2% | Embedded GPS lat | LOW — rarely populated |
| location_gpslong | STRING | 2% | Embedded GPS long | LOW — rarely populated |
| location_SitePhone | STRING | 0.5% | Site phone | **CONSUMED** (build_opportunities.sql contact hierarchy) |
| location_SiteEmail | STRING | 0.4% | Site email | **CONSUMED** (build_opportunities.sql) |
| location_SiteContact | STRING | 0.5% | Site contact name | LOW — very sparse |
| location_customfields | STRING | 2% | Location custom fields | LOW — rarely populated |
| location_archived | STRING | 2% | Location archived | LOW — metadata |
| requestdatetime | STRING | 100% | Request datetime | LOW — requestdate is used |
| completeddatetime | STRING | ~100% | Completion datetime | LOW — completeddate is used |
| duedatetime | STRING | 100% | Due datetime | LOW — duedate is used |
| priority | STRING | 100% | Job priority | MEDIUM — could indicate urgency for classification |
| refcode | STRING | 50% | Reference code | LOW — internal |
| salesperson | STRING | 80% | Salesperson name | MEDIUM — could identify booking source |
| readtask | STRING | 95% | Read flag | LOW — internal |
| readtaskdatetime | STRING | 95% | When read | LOW — internal |
| quote_totalinc | STRING | 1% | Quote inc GST | LOW — very sparse |
| quote_totaltax | STRING | 1% | Quote tax | LOW — very sparse |
| quote_estimator_userid | STRING | 1% | Estimator user | LOW — very sparse |
| quote_estimator_givennames | STRING | 1% | Estimator first name | LOW — very sparse |
| quote_estimator_surname | STRING | 1% | Estimator surname | LOW — very sparse |
| customfields | STRING | 0% | Custom fields JSON | LOW — always empty in tasks_deduped |
| labours | STRING | 0% | Labours JSON | LOW — always empty (use tasklabours_raw) |
| materials | STRING | 0% | Materials JSON | LOW — always empty |
| expenses | STRING | 0% | Expenses JSON | LOW — always empty |
| purchaseorders | STRING | 0% | Purchase orders JSON | LOW — always empty |
| assigneds | STRING | 0% | Assigned users JSON | LOW — always empty |
| assets | STRING | 0% | Assets JSON | LOW — always empty |
| assetid | STRING | 0% | Asset ID | LOW — always empty |
| documentsandphotos | STRING | 100% | Docs/photos URL | MEDIUM — job photos available |
| gpslatitude | STRING | 97% | GPS latitude | MEDIUM — geographic analysis |
| gpslongitude | STRING | 97% | GPS longitude | MEDIUM — geographic analysis |
| org_orgid | STRING | 100% | Organization ID | LOW — single org |
| org_orgname | STRING | 100% | Organization name | LOW — single org |
| custon | STRING | 50% | Customer order number | LOW — internal |
| createddatetimeutc | STRING | 100% | Created datetime | LOW — audit |
| createdutc | STRING | 100% | Created timestamp | LOW — audit |
| lastupdateddatetimeutc | STRING | 100% | Last updated datetime | LOW — audit |
| lastupdatedutc | STRING | 100% | Last updated timestamp | LOW — audit |
| linkprocessed | STRING | 95% | Link processed | LOW — internal |
| linkprocesseddate | STRING | 95% | Link processed date | LOW — internal |
| tasknotes | STRING | 90% | Inline task notes | MEDIUM — could supplement task_notes_deduped |
| substatus_substatus | STRING | 0.5% | AroFlo substatus | LOW — very sparse |
| substatus_substatusid | STRING | 0.5% | Substatus ID | LOW — very sparse |

### ds_aroflo.tasklabours_raw — UNUSED columns

| Column | Type | Pop Rate | Description | Relevance |
|--------|------|----------|-------------|-----------|
| task_taskid | STRING | 100% | Task ID | LOW — internal |
| task_webappEncodedID | STRING | 100% | Web app ID | LOW — internal |
| starttime | STRING | 95% | Work start time | MEDIUM — time-on-site analysis |
| endtime | STRING | 95% | Work end time | MEDIUM — time-on-site analysis |
| task_client_clientid | STRING | 100% | Client ID | LOW — available elsewhere |
| task_client_clientname | STRING | 100% | Client name | LOW — available elsewhere |
| task_org_orgid | STRING | 100% | Org ID | LOW — internal |
| task_org_orgname | STRING | 100% | Org name | LOW — internal |
| task_status | STRING | 100% | Task status | LOW — available elsewhere |
| task_refcode | STRING | 50% | Reference code | LOW — internal |
| task_linkprocessed | STRING | 90% | Link processed | LOW — internal |
| task_linkprocesseddate | STRING | 90% | Link processed date | LOW — internal |
| workdatetimestart | STRING | 95% | Work start datetime | MEDIUM — same-day vs multi-day work |
| workdatetimeend | STRING | 95% | Work end datetime | MEDIUM — same as above |
| labeodapproved | STRING | 90% | EOD approved | LOW — payroll |
| lablinkprocessed | STRING | 90% | Link processed | LOW — internal |
| lablinkprocesseddatetime | STRING | 90% | Link processed datetime | LOW — internal |
| lablocked | STRING | 100% | Locked flag | LOW — payroll |
| labverified | STRING | 80% | Verified flag | LOW — payroll |
| deleteddate | STRING | 5% | Deletion date | LOW — already filtered |
| deleteddatetime | STRING | 5% | Deletion datetime | LOW — already filtered |
| deletedtime | STRING | 5% | Deletion time | LOW — already filtered |

### ds_aroflo.task_notes_deduped — UNUSED columns

| Column | Type | Pop Rate | Description | Relevance |
|--------|------|----------|-------------|-----------|
| noteid | STRING | 100% | Note ID | LOW — internal |
| taskid | STRING | 100% | Task ID | LOW — jobnumber is used |
| userid | STRING | 100% | User ID | LOW — username is used |
| sticky | STRING | 100% | Sticky flag | LOW — display hint |
| note_raw | STRING | 100% | Raw HTML note | MEDIUM — richer formatting than note_clean for some cases |
| ingested_at | TIMESTAMP | 100% | Ingestion time | LOW — audit |

### ds_aroflo.contacts_deduped — UNUSED columns

| Column | Type | Pop Rate | Description | Relevance |
|--------|------|----------|-------------|-----------|
| contactid | STRING | 100% | Contact ID | LOW — userid is join key |
| clientname | STRING | 95% | Client name | LOW — available via tasks |
| firstname | STRING | 95% | First name | MEDIUM — could enrich contact_name |
| lastname | STRING | 95% | Last name | MEDIUM — could enrich contact_name |
| username | STRING | 95% | Username | LOW — internal |
| email2 | STRING | 0.2% | Secondary email | LOW — extremely sparse |
| phone | STRING | 48% | Landline phone | MEDIUM — additional identity signal |
| fax | STRING | 6% | Fax number | LOW — obsolete |
| contacttype | STRING | 100% | Contact type | MEDIUM — distinguishes customer vs vendor |
| accesstype | STRING | 100% | Access type | LOW — internal |
| notes | STRING | 100% | Contact notes | MEDIUM — free-text notes about customer |
| org_orgid | STRING | 100% | Org ID | LOW — internal |
| org_orgname | STRING | 100% | Org name | LOW — internal |
| createdutc | STRING | 100% | Created time | LOW — audit |
| createddatetimeutc | STRING | 100% | Created datetime | LOW — audit |
| archived | STRING | 100% | Archived flag | LOW — filtering |
| ingested_at | STRING | 100% | Ingestion time | LOW — audit |

### ds_aroflo.invoices_deduped — UNUSED columns (consumed only via vw_job_invoiced)

| Column | Type | Pop Rate | Description | Relevance |
|--------|------|----------|-------------|-----------|
| description | STRING | 80% | Invoice description | MEDIUM — could identify credit notes text |
| notes | STRING | 20% | Invoice notes | MEDIUM — payment details |
| lines | STRING | 100% | Line items JSON blob | **HIGH** — full line-item detail. Could enable per-service revenue breakdown. Currently only summed in vw_job_invoiced. |
| isTaxInclusive | STRING | 100% | Tax inclusive flag | LOW — always consistent |
| partinvoice | STRING | 5% | Part invoice flag | MEDIUM — indicates partial billing |
| surchargeamount | STRING | 5% | Surcharge | LOW — very sparse |
| deliverystatus | STRING | 30% | Email delivery status | LOW — internal |
| invoiceurl | STRING | 100% | Invoice URL | LOW — external link |
| invoicedbyuser_userid | STRING | 100% | Invoiced by user | LOW — internal |
| invoicedbyuser_username | STRING | 100% | Invoiced by username | MEDIUM — identifies who invoiced |
| client_orgid | STRING | 100% | Client org ID | LOW — available elsewhere |
| client_orgname | STRING | 100% | Client org name | LOW — available elsewhere |
| link_orgid | STRING | 30% | Accounting link org | LOW — internal |
| link_orgname | STRING | 30% | Accounting link name | LOW — internal |
| link_externalid | STRING | 30% | Xero/MYOB external ID | LOW — accounting integration |
| linkprocesseddate | STRING | 30% | Accounting sync date | LOW — internal |
| custon | STRING | 50% | Customer order number | LOW — internal |
| documentsandphotos | STRING | 80% | Docs/photos | LOW — internal |
| lastupdateuser_userid | STRING | 100% | Last update user | LOW — audit |
| lastupdateuser_username | STRING | 100% | Last update username | LOW — audit |

### ds_aroflo.task_customfields_deduped — UNUSED columns

| Column | Type | Pop Rate | Description | Relevance |
|--------|------|----------|-------------|-----------|
| taskid | STRING | 100% | Task ID | LOW — jobnumber used |
| ingested_at | TIMESTAMP | 100% | Ingestion time | LOW — audit |
| unit_number_other_not_cod_tasks | STRING | varies | Unit number | LOW — internal |
| service_fee_minimum_charge | STRING | varies | Service fee | MEDIUM — pricing analysis |
| substatus | STRING | varies | Custom substatus | LOW — duplicate concept |
| campaign_most_popular | STRING | varies | Campaign (most popular) | **HIGH** — legacy campaign attribution from AroFlo custom fields. Could cross-check WC attribution. |
| campaign_least_popular | STRING | varies | Campaign (least popular) | MEDIUM — secondary campaign |
| other_work_type_1 | STRING | varies | Secondary work type | MEDIUM — multi-service jobs |
| other_work_type_2 | STRING | varies | Tertiary work type | MEDIUM — multi-service jobs |
| rb_stage_1_meet_your_team | STRING | varies | Relationship-building stage 1 | LOW — marketing automation |
| rb_stage_2_feedback_request | STRING | varies | Relationship-building stage 2 | LOW — marketing automation |
| happy_call_grade | STRING | varies | Customer satisfaction grade | **HIGH** — direct quality/satisfaction signal. Could feed CRM quality metrics. |
| happy_call_details | STRING | varies | Customer satisfaction details | **HIGH** — free-text satisfaction feedback. |
| four_or_more_options | STRING | varies | Options presented flag | MEDIUM — sales process compliance |
| inspection_actually_carried_out | STRING | varies | Inspection done flag | MEDIUM — service delivery audit |
| photos_insp_report_stickers_tags | STRING | varies | Photos/compliance | LOW — internal QA |
| switchboard_details | STRING | varies | Switchboard info | LOW — electrical specific |
| switchboard_photos | STRING | varies | Switchboard photos | LOW — electrical specific |
| hot_water_heater_* (5 fields) | STRING | varies | Hot water heater details | LOW — plumbing specific |
| quoted_surge_protection | STRING | varies | Surge protection quoted | LOW — electrical specific |
| quoted_smokies_interlinks | STRING | varies | Smoke alarms quoted | LOW — electrical specific |
| quoted_earth_upgrade | STRING | varies | Earth upgrade quoted | LOW — electrical specific |

---

## Summary of HIGH-Relevance Unused Data

### Strongest Signals (immediate value for classification/matching)

1. **WC `form_reason_did_not_convert` + `form_reason_did_not_convert_detail`** (100% / 35% pop) — Human-classified loss reasons from WC. Could seed or validate CRM classification without T7.

2. **WC `quotable`** (100% pop) — WC's human judgment on quotability. Direct input for "Not Quotable" funnel stage.

3. **WC `form_job_number`** (30% pop) — Direct job number linkage from WC classifiers. Could validate opportunity clustering.

4. **WC `lead_class`** (in all_leads_classified, 100% pop) — Full WC classification label.

5. **WC `is_booking` / `is_converted_job`** (in all_leads_classified) — Boolean booking/conversion flags.

6. **WC `caller_name`** (60% pop) — CNAM caller ID. Often populated when contact_name is null.

7. **WC `additional_fields_json`** (100% pop, 62 keys) — Full form submission content. Keys like "How Can We Help?*", "My question is *" hold unique content not in form_my_problem.

8. **task_customfields_deduped `campaign_most_popular`** — Legacy AroFlo campaign attribution.

9. **task_customfields_deduped `happy_call_grade` + `happy_call_details`** — Customer satisfaction data.

10. **tasks_deduped `contact_givennames` + `contact_surname`** — Customer name from task contact (86% pop). Could supplement contact_name resolution.

11. **raw_calls `ring_duration`** (100% pop) — Ring time before answer. Could compute first_response_minutes (currently NULL placeholder).

12. **invoices_deduped `lines`** (100% pop, JSON blob) — Full line-item invoice detail. Enables per-service revenue breakdown.

### JSON Blobs with Unused Content

| Blob | Location | Status |
|------|----------|--------|
| `additional_fields_json` | gd_WhatConverts.all_leads_enriched | **62 keys, 100% populated.** Named form_* columns extract some keys but miss many (especially wpforms numeric IDs and "How Can We Help?" variants). |
| `custom_fields_json` | gd_WhatConverts.all_leads_enriched | 7 keys, mostly empty values. "Reason for Call / Job" is unique content. |
| `raw_json` | gd_WhatConverts.all_leads_enriched | Full WC API response. Only `$.recording` URL extracted. Contains all other WC fields. |
| `lines` | ds_aroflo.invoices_deduped | Invoice line items. Only summed total consumed via vw_job_invoiced. |
| `customfields` | ds_aroflo.tasks_deduped | Always empty (0% pop) — dead column. |
| `labours/materials/expenses/purchaseorders/assigneds/assets` | ds_aroflo.tasks_deduped | Always empty (0% pop) — dead columns (data lives in separate tables). |
| `customer_journey_json` | gd_WhatConverts.all_leads_enriched | Never populated (0%). |
| `field_mappings_json` | gd_WhatConverts.all_leads_enriched | Never populated (0%). |
| `lead_analysis_json` | gd_WhatConverts.all_leads_enriched | Always empty `[]` despite 100% pop. |
