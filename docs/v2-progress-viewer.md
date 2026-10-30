# v2 progress: document viewer (branch v2-viewer)

## Done
- `viewer/` project: package.json (pdfjs-dist 6.4.299, dev tools pinned like the dashboard), tsconfig,
  eslint config (raw-HTML sinks banned), vite.config.ts (base `/d/_/`, output `viewer/dist`).
- `scripts/copy-pdfjs-assets.mjs`: copies standard fonts, cmaps, ICC profiles and the JavaScript
  decoder fallbacks into `public/` (git-ignored), so everything is same-origin; quickjs and `.wasm`
  files are left out (D-130).
- `index.html`, `src/viewer.css`: fixed top bar (name, page counter, zoom, Download), light and dark,
  mobile friendly, 44 px buttons, no inline scripts or styles (CSP `script-src 'self'`); zoomed pages
  scroll sideways instead of being cut off on the left.
- `src/link.ts`: token from `/d/{token}`, `/d/{token}/info` shape check, size formatting.
- `src/beat.ts`: visible-time clock and heartbeat (first beat at once, every 5 s while visible, a last
  beat with sendBeacon when hidden or closed, at most 10 s per beat, more is dropped; no duplicate
  last beat on pagehide after hiding).
- `src/main.ts`: loads info, renders pages lazily with PDF.js (`useWasm: false`, no eval, no XFA);
  one observer draws pages 600 px ahead, a second one without margin measures what is on screen
  (current page; viewed = half the page on screen or half the screen filled); zoom steps; Download
  only when allowed; separate messages for unknown links (404), expired or turned-off links (410) and
  errors.
- Tests: `src/link.test.ts`, `src/beat.test.ts` (16 tests).
- Wiring: `scripts/verify.ps1` runs the viewer checks, `scripts/dev.ps1` builds the viewer with the
  dashboard, `backend/Dockerfile` copies `viewer/dist` to `static/viewer/`, `.dockerignore` lets it in,
  CLAUDE.md commands and layout, D-130.

## Next
- End-to-end check once the backend `/d/` routes exist (branch v2-core): open a link on a throwaway
  stack, check the CSP has no violations, the worker loads, beats arrive, view and read count.
