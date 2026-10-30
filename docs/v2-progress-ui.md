# MailPulse v2: dashboard progress (branch v2-ui)

Updated 2026-10-30 by the dashboard engineer. Contract: docs/v2-contract.md (the Pagination section is on
`main`). Decisions: D-090 to D-098.

## Done
- E1 shell (D-090): full-height sidebar with its own scroll, pinned footer and collapse to icons;
  fixed solid top bar outside the single scroll container (title and page actions are portalled
  into it, border and shadow once content scrolls); scroll reset on navigation and restore on Back;
  under 1024 px a top bar with menu button and a Radix drawer (focus trap, Esc, backdrop, closes on
  navigation); 44 px touch targets on small screens.
- E1 tokens: semantic colours for light and dark (AA text contrast), radii, shadows, Inter Variable
  bundled locally, thin themed scrollbars, visible focus ring, reduced motion, theme fade.
- Theme: System / Light / Dark icon control in the sidebar footer and the mobile top bar, shared
  state, no flash on load via `public/assets/theme-init.js` (D-092).
- Part A bugs: 1 (layout), 2 (time-zone migration, searchable picker, "Use my current time zone",
  all formatters in `settings.timeZone`), 3 (whole-number y-axis, styled unclipped tooltip, date
  input always shows a date), 4 (all 7 weekday labels, integer ticks, compact height, rounded bars),
  5 (activity rows truncate recipients and detail separately, full text as tooltip), 8 (Advanced
  collapsed, natural card heights, sticky unsaved bar, warning on leave).
- Settings → Notifications (`notifyOn`, quiet hours) and Documents (`notifyDocuments`,
  `docReadSeconds`) fields with validation.
- Bug 7: no native select, number, date or radio input is left. Settings uses steppers, themed
  selects (network addresses, follow-up hours, quiet-hours times in half-hour steps) and radio
  groups (notify on, send mode); Reports uses the segmented Day/Week control and the date picker
  (no future days); the email page's follow-up choice, the Emails account filter and the page-size
  choice are themed selects; Emails and Alerts filters use the segmented control. Saving settings
  shows a toast; quiet hours must start and end at different times (as the backend checks).
- Building blocks (D-096 to D-098): Select (select-only combobox), NumberStepper, DatePicker
  (react-day-picker, own chunk), RadioGroup, Segmented control with counts, Tabs, Tooltip, Skeleton,
  Button with loading state, Badge, Modal and ConfirmDialog, toasts with actions, DataTable (sticky
  header and first column, sortable headers, skeleton/empty/error states, whole-row click, phone
  layout), status marks per the contract display rule, initials avatars, open-rate bar, URL list
  state (`useListParams`: page, size, sort, dir, filters; changes reset to page 1 and scroll the
  content to the top), Pagination with first/previous/next/last, range and page-size select.
- API layer for the v2 contract: email counts and sorting, paged email events and contact emails,
  activity `kinds` and `before` paging, notifications and mark-read, search, "That was me" and undo,
  documents (upload and replace with progress, rename, delete, links, paged links and events),
  download with progress.
- Bug 9: not ours. `extension/static/manifest.json` injects `content.js` only on
  `https://mail.google.com/*`, the extension never calls `chrome.scripting`, and its source has no
  fixed-position element or ">_<" text. The floating button comes from another extension.
- Tests: shell structure, drawer, theme switch, sidebar collapse, time-zone migration and picker,
  settings layout and the leave warning, chart ticks, activity truncation, report date, pagination,
  and every building block (keyboard use of Select, stepper limits, calendar pick and clear, radio
  arrows, tabs, table states and sorting, the mark rule, toasts, confirm dialog).

- Lists (D-099 to D-101): Emails (counts in the filter, sortable columns, debounced search, account
  select, avatars, marks with counts, "Opened again" chip), Contacts (avatars, open-rate bar,
  sortable), contact detail (paged emails), Alerts and Tokens (client-side) page with 25/50/100 in
  the URL; compact pager in the top bar on Emails and Contacts, full pager below. Activity: day
  groups, filter chips, "Load older", icons, document events, "Open in Gmail". Tokens: new token in
  a dialog, revoke behind a confirm dialog, toasts. Overview asks for 25 and shows five.

## Not done (next, in priority order)
2. Paged email events on the email page, document links and events (with item 3).
3. Parts B/C/D on the dashboard: status marks per the display rule with counts, opens timeline,
   "Opened again" chip, "That was me" buttons and the repeat-open note, notification bell and
   panel, live toasts, Documents list/detail/share links, document events in Activity and email
   detail, Ctrl+K search, new routes in `DashboardController.ROUTES`.
4. E2 polish: KPI trends and ring, error boundary per route, 404 page, problem-detail messages,
   toasts for every action, connection banner, session-expiry return with a message, token dialog,
   password strength, export progress, lazy routes.
5. `dashboard/scripts/shoot.mjs` (playwright-core + axe-core, scrolled shots, page-scroll check)
   and the 360 px jsdom smoke test for the new pages.

## Gaps and notes
- Radix's scroll lock tries to insert a `<style>` element that the CSP blocks (console message only).
- LIMITATIONS.md text for the double-open fix is left to the backend branch to avoid conflicts.
- Initial bundle 498 kB (156 kB gzip) until the routes are lazy-loaded (item 4).
