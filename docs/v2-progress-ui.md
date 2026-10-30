# MailPulse v2: dashboard progress (branch v2-ui)

Updated 2026-10-30 by the dashboard engineer. Contract: docs/v2-contract.md. Decisions: D-090 to D-095.

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
- Pagination component: "1–25 of 140", first / previous / next / last, optional page-size select
  (25 / 50 / 100), `paginate()` for client-side lists; used on Emails, Contacts and Alerts with the
  page in the URL. Tests cover the component, client-side paging and the URL.
- Types for the v2 settings, activity kinds (`DOC_*`) and the `DOC_VIEWS` alert.
- Bug 9: not ours. `extension/static/manifest.json` injects `content.js` only on
  `https://mail.google.com/*`, the extension never calls `chrome.scripting`, and its source has no
  fixed-position element or ">_<" text. The floating button comes from another extension.
- Tests: shell structure (top bar outside the scroll container, title in the top bar, toolbar),
  drawer, theme switch, sidebar collapse, time-zone migration and picker, settings layout and the
  leave warning, chart ticks, activity truncation, report date.

Checks: `scripts/verify.ps1` green on 2026-10-30 13:06 (dashboard 43 tests in 4 files, extension 45,
backend 55 unit plus integration tests, npm audit clean). Initial bundle 461 kB (143 kB gzip); pages
are not lazy-loaded yet.

## Not done (next, in priority order)
1. Bug 7: custom Select, Number stepper and Date picker (react-day-picker) to replace native
   controls; the theme dropdown is already replaced.
2. Page-size select and top placement on the long lists, the paged endpoints from the
   coordinator's note (email events, contact emails, document links and events), client-side
   paging on Tokens and Documents; DataTable with sticky first column, sortable headers,
   skeleton rows; Activity cursor paging ("Load older").
3. Parts B/C/D on the dashboard: status marks per the display rule with counts, opens timeline,
   "Opened again" chip, "That was me" buttons and the repeat-open note, notification bell and
   panel, live toasts, Documents list/detail/share links, document events in Activity and email
   detail, Ctrl+K search, new routes in `DashboardController.ROUTES`.
4. E2 polish: KPI trends and ring, avatars, error boundary per route, 404 page, problem-detail
   messages, toasts, connection banner, session-expiry return with a message, token dialog,
   password strength, export progress, lazy routes.
5. `dashboard/scripts/shoot.mjs` (playwright-core + axe-core, scrolled shots, page-scroll check)
   and the 360 px jsdom smoke test.

## Gaps and notes
- Radix's scroll lock tries to insert a `<style>` element that the CSP blocks (console message only).
- LIMITATIONS.md text for the double-open fix is left to the backend branch to avoid conflicts.
