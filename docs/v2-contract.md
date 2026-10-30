# MailPulse v2: API contract

Shared contract for the v2 work (live ticks, repeat opens, documents, new UI). The backend implements it;
the dashboard and the extension build against it. Times are ISO-8601 UTC strings unless a field says
otherwise. Names are final; add fields only when a part needs them, and note them here.

## Settings (`GET/PUT /api/settings`)
New fields on `Settings`:

| Field | Type | Default | Notes |
|---|---|---|---|
| `timeZoneSource` | `'DEFAULT' \| 'AUTO' \| 'USER'` | `DEFAULT` | V4 migration: existing row with `time_zone = 'UTC'` becomes `DEFAULT`, any other zone `USER`. |
| `notifyOn` | `'FIRST' \| 'EVERY' \| 'EVERY_AFTER_GAP'` | `EVERY` | Which counted opens notify. Gap = 60 minutes (constant `REOPEN_GAP`). |
| `notifyDocuments` | boolean | `true` | Document view/read/download notifications. |
| `quietHoursEnabled` | boolean | `false` | Extension shows no desktop notifications in quiet hours. |
| `quietHoursStart`, `quietHoursEnd` | `"HH:mm"` | `"22:00"`, `"07:00"` | In the settings time zone; may wrap midnight. |
| `docReadSeconds` | int 10..600 | `30` | Total visible time that turns a document view into a read. |

Time-zone migration: when the dashboard loads settings with `timeZoneSource = 'DEFAULT'`, it saves the
browser zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) with `timeZoneSource = 'AUTO'` once.
The picker and "Use my current time zone" save with `USER`. Every date and time in the dashboard is
formatted in `settings.timeZone`.

Validation: `quietHoursStart` and `quietHoursEnd` must be `HH:mm` (00:00..23:59) and differ; enums are case-sensitive;
the PUT body is the full `Settings` object (missing fields give 400, as before).

`GET /api/config` (extension) adds `configVersion` (16 hex characters, a hash of every config value, so it changes
whenever settings change),
`notifyOn`, `notifyDocuments`, `quietHoursEnabled`, `quietHoursStart`, `quietHoursEnd`, `timeZone`.

## Opens
Every counted open is kept with its time (counted `tracking_event` rows). Repeats from the same reader
inside `dedupeWindowSeconds` still count as one (existing rule).

`EmailSummary` (list, detail, contact detail) adds:
- `openedAgain: boolean`: the latest counted open came at least 60 minutes after the one before.
- `recentOpens: string[]`: up to 5 latest counted open times, newest first.

`EmailDetail` adds `opens: { eventId: number; at: string; source: string }[]` (every counted open,
oldest first) and `account` is already in `summary`.

Owner correction (the "that was me" fix for opens from the owner's phone or other browsers):
- `POST /api/emails/{id}/events/{eventId}/mine` (owner only): a COUNTED open or click becomes IGNORED
  with reason `OWNER`, counters (`open_count`, first/last opened, clicks, link clicks) are recomputed from
  the remaining counted events, its activity row is removed. Returns the updated `EmailDetail`.
- `DELETE /api/emails/{id}/events/{eventId}/mine`: undo; the event is COUNTED again, counters recomputed,
  no new notification. Returns the updated `EmailDetail`.
- Dashboard REASONS adds `OWNER: 'You marked this as your own view'`.

`GET /api/emails` adds `sort` (`sent` default, `opens`, `clicks`, `lastOpened`) and `dir` (`asc|desc`,
default `desc`); `size` allows 25, 50 or 100. `GET /api/emails/counts?account=&q=` returns
`{ all, opened, notOpened, clicked }` for the filter labels.

`GET /api/contacts` adds `sort` (`lastEmailed` default, `opens`, `emails`, `openRate`) and `dir`.

`GET /api/reports/daily|weekly` adds `previous: { sent, openedEmails, openRate, opens, clicks }` for the
period of the same length just before (trend arrows on Overview).

`GET /api/search?q=` (owner, q at least 2 characters) returns
`{ emails: EmailSummary[], contacts: ContactSummary[], documents: DocumentSummary[] }`, 5 of each at most.

## Marks and hover card (extension token or owner)
`Mark` adds `firstOpenedAt`, `recentOpens` (as above), `openedAgain`, `documentViews` (int).
Display rule (dashboard and extension use the same):

| Status | Mark |
|---|---|
| Sent | grey ✓ |
| Opened | green ✓✓ |
| Opened N× (N ≥ 2) | green ✓✓ + count |
| Clicked | ✓✓ + link dot |
| Unreliable (no opens, `openStatusUnreliable`) | grey ✓ + "?" |
| Not tracked | no mark |

`GET /api/emails/{id}/card` → `{ emailId, subject, recipients, account, gmailThreadId, openCount,
firstOpenedAt, lastOpenedAt, recentOpens, clickCount, lastClickedAt, alerts: { type, text }[],
documents: { name, views, reads, downloads }[] }`.

## Activity and notifications
`ActivityItem.kind` adds `'DOC_VIEW' | 'DOC_READ' | 'DOC_DOWNLOAD'`. New fields (null when not relevant):
- `openNumber`: for OPEN, the n-th counted open of that email (1 = first).
- `account`, `gmailThreadId`: for "Open in Gmail".
- `documentId`, `documentName`, `linkLabel`, `readSeconds`, `pagesViewed`, `pageCount`: for DOC_*.
- `shouldNotify` now also applies `notifyOn` (FIRST: openNumber 1 only; EVERY_AFTER_GAP: first open, or
  an open at least 60 minutes after the previous counted open) and `notifyDocuments`.

`GET /api/activity` (existing, `since` with the alias `after`, and `limit` 1..100) adds the `kinds` filter (comma
list; unknown kinds give 400) and `before=<id>` for the page of older items. The response adds `configVersion` and
`hasMore` (with `since`/`after`: newer items exist beyond this page; otherwise older items exist). Items are always
oldest first; `lastId` stays the newest id overall, whatever the filter. Dashboard grouping and filter chips use `kinds`.
An open restored with "That was me" undo comes back as a new item with `shouldNotify: false`.

Notification center (owner): `GET /api/notifications?limit=30` → `{ items: ActivityItem[], unread: number,
lastReadId: number }`; `POST /api/notifications/read` with `{ upToId }` → 204 (stored server-side).

`AlertType` adds `DOC_VIEWS` (a document link viewed 3 or more times).

## Documents (owner; list and per-email links also allowed for the extension token)
`DocumentSummary`: `{ id, name, sizeBytes, pageCount: number | null, version, createdAt, updatedAt,
views, reads, downloads, lastActivityAt: string | null }`.

| Method and path | Body | Result |
|---|---|---|
| `GET /api/documents` | | `DocumentSummary[]` |
| `POST /api/documents` | multipart `file` (+ optional `name`) | 201 `DocumentSummary` |
| `PATCH /api/documents/{id}` | `{ name }` | `DocumentSummary` |
| `PUT /api/documents/{id}/file` | multipart `file` | `DocumentSummary` (new version; old links serve it) |
| `DELETE /api/documents/{id}` | | 204 |
| `GET /api/documents/{id}` | | `{ summary, links: DocLinkView[], events: DocEventView[] }` |
| `POST /api/documents/{id}/links` | `{ label?, emailId?, expiresAt?, allowDownload? }` | 201 `DocLinkView` |
| `PATCH /api/document-links/{linkId}` | `{ label?, expiresAt?, allowDownload?, revoked? }` | `DocLinkView` |

`DocLinkView`: `{ id, url, label, emailId, emailSubject, recipients, createdAt, expiresAt, revokedAt,
allowDownload, views, reads, downloads, lastActivityAt }`. `url` is `publicBaseUrl + /d/{token}`.
`DocEventView`: `{ id, linkId, type, at, verdict, reason, source, userAgent, ipPrefix, readSeconds,
pagesViewed }`.

Rules: PDF only (first bytes `%PDF-`), at most 10 MB, at most 100 documents. The stored name is cleaned
(no path, no control characters, at most 120 characters, ends in `.pdf`); the uploaded file name is never
trusted. Files are encrypted at rest with AES-256-GCM (same key handling as the other encrypted fields).

## Public document routes (port 8081; Funnel mounts `/d/`)
- `GET|HEAD /d/{token}`: viewer page (static shell, assets under `/d/_/`). Expired, revoked or deleted
  links get a friendly HTML page (410 or 404), never a stack trace.
- `GET /d/{token}/info`: JSON `{ name, pageCount, sizeBytes, allowDownload }` for the viewer page (`Cache-Control:
  no-store`); expired, revoked or unknown links answer 410 or 404 as problem JSON.
- `GET /d/{token}/pdf`: the PDF for the viewer (inline, `Cache-Control: no-store`, `nosniff`).
- `GET /d/{token}/file`: download (`Content-Disposition: attachment` with a safe file name); 403 page when
  downloads are off. Counts `DOC_DOWNLOAD` (HEAD, scanners, bursts and the self header are ignored like
  clicks).
- `POST /d/{token}/beat` JSON `{ viewId (uuid), visibleMs (0..10000), page, pagesViewed: number[],
  pageCount }` → 204. The first beat of a `viewId` counts `DOC_VIEW`; when the visible time of that view
  reaches `docReadSeconds`, `DOC_READ` counts once with `readSeconds` and `pagesViewed`. Rate limited per
  link and network. The viewer sends a beat every 5 s, only while the page is visible.
- `GET /d/_/{asset}`: viewer assets from `classpath:/static/viewer/` (built from `viewer/`).
- Viewer CSP: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:;
  font-src 'self'; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none';
  form-action 'none'`.
Requests with the self header (`X-MailPulse-Self`) never count. Document events count without the
self-view hold, so notifications arrive within 15 s.

## Pagination
Every paged endpoint returns `Page<T>` = `{ items, page, size, total }`, takes `page` (0-based, default 0) and accepts
`size` 25, 50 or 100 only (default 25); other sizes give 400. This includes the existing `/api/emails`, `/api/contacts`
and `/api/alerts`. Existing response shapes stay; these endpoints are additions:
- `GET /api/emails/{id}/events?page=&size=` → `Page<EventView>`, newest first. `EmailDetail.events` stays, capped at
  the latest 100.
- `GET /api/contacts/{address}/emails?page=&size=&sort=&dir=` → `Page<EmailSummary>`, same sort keys as `/api/emails`.
- `GET /api/activity?before=<id>&limit=` for older items, with the `kinds` filter; the response has `hasMore`.
- `GET /api/documents/{id}/links?page=&size=` → `Page<DocLinkView>`; `GET /api/documents/{id}/events?page=&size=` →
  `Page<DocEventView>`.
- `/api/documents` (at most 100) and `/api/tokens` stay arrays; the dashboard pages them on the client.
