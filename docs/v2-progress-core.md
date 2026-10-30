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

## Not done (next, in this order)
1. Documents: storage (AES-256-GCM), API, links, public `/d/` routes, viewer CSP, PortRoutingFilter and
   SecurityConfig for `/d/`, DOC_VIEW/DOC_READ/DOC_DOWNLOAD counting, DOC_VIEWS alert, document notifications,
   `Mark.documentViews` and the card's `documents`.
2. `scripts/funnel.ps1` and `scripts/check-public.ps1` for `/d/`, the CLAUDE.md hard rule, the documents notes in
   LIMITATIONS.
3. `scripts/seed-demo.ps1`.
4. Delay measurement on a throwaway stack.

## Gaps
- The V4 time-zone migration is tested only for the default (UTC) row; the `USER` branch is a one-line SQL `CASE`.
- Alerts raised by an open that the owner later marks as "That was me" stay (D-072).

## Measured delays
Not measured yet (item 5). Expected for an email open: the 30 s hold plus up to 5 s for the finalizer, then the
extension's poll interval.
