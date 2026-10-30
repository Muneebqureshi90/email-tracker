# v2 core (backend) progress

Branch `v2-core`. Contract: docs/v2-contract.md. Decisions D-069 onwards.

## Done
- V4 migration: `time_zone_source` (UTC row becomes `DEFAULT`, any other zone `USER`), `notify_on`,
  `notify_documents`, quiet hours, `doc_read_seconds`; silent activity rows; an index on counted events.
- Settings: the new fields with validation (HH:mm, start and end differ, 10..600 s, enums).
- `/api/config`: `configVersion` (hash of every value), `notifyOn`, `notifyDocuments`, quiet hours, `timeZone`.
- Counted-open data: `EmailSummary.openedAgain` and `recentOpens`, `EmailDetail.opens`, `Mark.firstOpenedAt`,
  `recentOpens` and `openedAgain`.
- Activity: `openNumber`, `account`, `gmailThreadId`, `shouldNotify` with `notifyOn` (FIRST, EVERY, EVERY_AFTER_GAP);
  `kinds` filter, `before` paging, `hasMore`, `configVersion`, `after` as an alias of `since`.
- "That was me": `POST/DELETE /api/emails/{id}/events/{eventId}/mine` (owner only), counters and link counters
  recomputed from counted events, activity row removed, undo restores without a notification.
- Reports: `previous` totals for the period just before.
- Tests: `RepeatOpensTest` (rules), `RepeatOpensIT` (history, numbering, notify-on modes, "That was me" for opens
  and clicks, the owner's own views never change counts, activity paging), `SettingsIT` and `ContactsAndReportsIT`
  extended.
- Lists (item 1): one page rule for every paged endpoint (25/50/100, D-074); email `sort`/`dir` and
  `/api/emails/counts`; contact `sort`/`dir`; `/api/emails/{id}/events` and `/api/contacts/{address}/emails` pages;
  `EmailDetail.events` capped at the latest 100; the hover card (`/api/emails/{id}/card`); the notification center
  (`/api/notifications`, `/read`, V5); quick search (`/api/search`). Card and search `documents` arrive with item 2.
  Tests: `ListsAndCardIT`.
- Docs: contract (activity paging, settings validation, `/d/{token}/info`, Pagination section), LIMITATIONS (live
  opens, no email read time, the double-open explanation and the phone tip).
- Documents (item 1, D-077 to D-085): V6 schema; PDF upload (magic bytes, 10 MB, 100 max, cleaned names),
  AES-256-GCM files, rename, new version, delete; links (one working link per email, 200 on repeat; share links with
  label, expiry, download switch, revoke); public `/d/{token}`, `/info`, `/pdf`, `/file`, `/beat`, `/d/_/**` viewer
  files with the viewer CSP, friendly 404/410/403/429/503 pages; PortRoutingFilter and SecurityConfig (extension:
  GET /api/documents and POST links with emailId); counting with the click rules, reload merge, wall-clock guard,
  DOC_READ at `docReadSeconds`; activity fields and `openNumber` for DOC_*, notify rules; DOC_VIEWS alert;
  `Mark.documentViews`, card and search documents, `EmailDetail.documentLinks/documentEvents`, export, delete-all,
  retention. Tests: DocumentFilesTest, DocumentRulesTest, PortRoutingFilterTest, AlertRulesTest, DocumentsIT,
  DocumentViewsIT, MaintenanceIT (document retention).
- Scripts and docs (item 2): funnel.ps1 mounts `/d/` (on, off, mapping B); check-public.ps1 checks the `/d/` routes and
  reports whether the viewer is packaged; CLAUDE.md hard rule for port 8081 and the Funnel line; LIMITATIONS
  "Document links"; contract details for the document fields and routes.

## Not done (next, in this order)
1. `scripts/seed-demo.ps1` (skipped on the coordinator's request).
2. Delay measurement on a throwaway stack (skipped on the coordinator's request).

## Gaps
- The V4 time-zone migration is tested only for the default (UTC) row; the `USER` branch is a one-line SQL `CASE`.
- Alerts raised by an open that the owner later marks as "That was me" stay (D-072).
- Documents: no "That was me" for document events; two visible tabs of one reader within a reload window can add
  time twice; the page count is null for PDFs whose page tree is compressed (D-078).
- The viewer packaging (Dockerfile, classpath:/static/viewer/) is the coordinator's part; without it `/d/{token}`
  answers 503.

## Measured delays
Not measured yet. Expected for an email open: the 30 s hold plus up to 5 s for the finalizer, then the
extension's poll interval.
