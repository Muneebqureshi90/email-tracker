// MailPulse document viewer: renders a shared PDF with the bundled PDF.js (no CDN, no eval, no
// WebAssembly) and reports visible reading time (beat.ts). Untrusted text is set with textContent only.
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Heartbeat, type BeatPayload } from './beat';
import { fitScale, isUnreadablePdf } from './fit';
import { formatSize, isLinkInfo, tokenFromPath, type LinkInfo } from './link';

GlobalWorkerOptions.workerSrc = workerUrl;

const ASSETS = '/d/_/';
const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

const nameEl = element<HTMLHeadingElement>('name');
const pagesEl = element<HTMLSpanElement>('pages');
const statusEl = element<HTMLParagraphElement>('status');
const sheetsEl = element<HTMLDivElement>('sheets');
const docEl = element<HTMLElement>('doc');
const downloadEl = element<HTMLAnchorElement>('download');
const zoomIn = element<HTMLButtonElement>('zoom-in');
const zoomOut = element<HTMLButtonElement>('zoom-out');
const zoomFit = element<HTMLButtonElement>('zoom-fit');

function showStatus(text: string): void {
  statusEl.textContent = text;
  statusEl.hidden = false;
}

function pageOf(entry: IntersectionObserverEntry): number {
  return Number((entry.target as HTMLElement).dataset.page);
}

class Viewer {
  private zoom = 1;
  /** Page number to the scale it was drawn at. */
  private readonly rendered = new Map<number, number>();
  private readonly sheets: HTMLDivElement[] = [];
  /** Pages close to the screen, drawn before they scroll into view. */
  private readonly near = new Set<number>();
  /** How much of each page is on screen: its visible share, or the share of the screen it fills. */
  private readonly shown = new Map<number, number>();
  readonly viewed = new Set<number>();
  current = 1;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly pdf: PDFDocumentProxy,
    private readonly firstPage: PDFPageProxy,
  ) {}

  get pageCount(): number {
    return this.pdf.numPages;
  }

  /** Scale that fits the first page's width into the reading area (at most the reading width), times the zoom. */
  private scale(): number {
    const available = Math.max(200, docEl.clientWidth - 32);
    const width = this.firstPage.getViewport({ scale: 1 }).width;
    return fitScale(available, width) * this.zoom;
  }

  mount(): void {
    const base = this.firstPage.getViewport({ scale: this.scale() });
    for (let number = 1; number <= this.pageCount; number += 1) {
      const sheet = document.createElement('div');
      sheet.className = 'sheet';
      sheet.dataset.page = String(number);
      sheet.setAttribute('role', 'img');
      sheet.setAttribute('aria-label', `Page ${number} of ${this.pageCount}`);
      sheet.style.width = `${Math.floor(base.width)}px`;
      sheet.style.height = `${Math.floor(base.height)}px`;
      sheetsEl.append(sheet);
      this.sheets.push(sheet);
    }
    // Two observers: the margin one draws ahead of scrolling, the plain one measures what is really
    // on screen (a margin would count pages just below the screen as visible).
    const nearby = new IntersectionObserver((entries) => this.onNear(entries), { root: docEl, rootMargin: '600px 0px' });
    const onScreen = new IntersectionObserver((entries) => this.onScreen(entries), {
      root: docEl,
      threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
    });
    for (const sheet of this.sheets) {
      nearby.observe(sheet);
      onScreen.observe(sheet);
    }
    this.updatePages();
    window.addEventListener('resize', () => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => this.relayout(), 200);
    });
  }

  setZoom(next: number): void {
    this.zoom = next;
    zoomOut.disabled = next <= MIN_ZOOM;
    zoomIn.disabled = next >= MAX_ZOOM;
    this.relayout();
  }

  step(direction: 1 | -1): void {
    const next =
      direction > 0
        ? ZOOM_STEPS.find((value) => value > this.zoom + 0.001)
        : ZOOM_STEPS.findLast((value) => value < this.zoom - 0.001);
    if (next !== undefined) this.setZoom(next);
  }

  /** New size for every sheet; the pages near the screen are drawn again. */
  private relayout(): void {
    const anchor = this.current;
    const scale = this.scale();
    this.rendered.clear();
    void Promise.all(
      this.sheets.map(async (sheet, index) => {
        const page = index === 0 ? this.firstPage : await this.pdf.getPage(index + 1);
        const viewport = page.getViewport({ scale });
        sheet.style.width = `${Math.floor(viewport.width)}px`;
        sheet.style.height = `${Math.floor(viewport.height)}px`;
        sheet.replaceChildren();
      }),
    ).then(() => {
      this.sheets[anchor - 1]?.scrollIntoView({ block: 'start' });
      for (const number of this.near) void this.render(number);
    });
  }

  private onNear(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const number = pageOf(entry);
      if (entry.isIntersecting) {
        this.near.add(number);
        void this.render(number);
      } else {
        this.near.delete(number);
      }
    }
  }

  private onScreen(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const screen = entry.rootBounds?.height ?? 0;
      const fills = screen > 0 ? entry.intersectionRect.height / screen : 0;
      this.shown.set(pageOf(entry), entry.isIntersecting ? Math.max(entry.intersectionRatio, fills) : 0);
    }
    let best = this.current;
    let bestShown = 0;
    for (const [number, shown] of this.shown) {
      if (shown >= 0.5) this.viewed.add(number);
      if (shown > bestShown) {
        best = number;
        bestShown = shown;
      }
    }
    this.current = best;
    this.updatePages();
  }

  private updatePages(): void {
    pagesEl.textContent = `Page ${this.current} of ${this.pageCount}`;
  }

  private async render(number: number): Promise<void> {
    const scale = this.scale();
    if (this.rendered.get(number) === scale) return;
    this.rendered.set(number, scale);
    const sheet = this.sheets[number - 1];
    if (!sheet) return;
    const page = number === 1 ? this.firstPage : await this.pdf.getPage(number);
    const viewport = page.getViewport({ scale });
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    try {
      await page.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] }).promise;
      if (this.rendered.get(number) === scale) sheet.replaceChildren(canvas);
    } catch {
      this.rendered.delete(number);
    }
  }
}

function sendBeat(token: string, payload: BeatPayload, final: boolean): void {
  const url = `/d/${token}/beat`;
  const body = JSON.stringify(payload);
  if (final && typeof navigator.sendBeacon === 'function') {
    if (navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))) return;
  }
  void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'omit' }).catch(
    () => undefined,
  );
}

type InfoResult = { kind: 'ok'; info: LinkInfo } | { kind: 'missing' } | { kind: 'gone' } | { kind: 'error' };

async function loadInfo(token: string): Promise<InfoResult> {
  try {
    const response = await fetch(`/d/${token}/info`, { credentials: 'omit', headers: { Accept: 'application/json' } });
    if (response.status === 404) return { kind: 'missing' };
    if (response.status === 410) return { kind: 'gone' };
    if (!response.ok) return { kind: 'error' };
    const body: unknown = await response.json();
    return isLinkInfo(body) ? { kind: 'ok', info: body } : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

const NOT_FOUND = 'This link is not valid. Ask the sender for a new one.';
const TRY_LATER = 'This document could not be opened right now. Try again in a few minutes.';
const CANNOT_DISPLAY = 'This document can’t be displayed.';

async function start(): Promise<void> {
  const token = tokenFromPath(location.pathname);
  if (!token) {
    nameEl.textContent = 'Link not found';
    showStatus(NOT_FOUND);
    return;
  }
  const result = await loadInfo(token);
  if (result.kind !== 'ok') {
    nameEl.textContent = result.kind === 'error' ? 'Document' : 'Document not available';
    if (result.kind === 'missing') showStatus(NOT_FOUND);
    else if (result.kind === 'gone') showStatus('This link has expired or was turned off by the sender. Ask them for a new link.');
    else showStatus(TRY_LATER);
    return;
  }
  const { info } = result;
  nameEl.textContent = info.name;
  nameEl.title = info.name;
  document.title = info.name;
  if (info.allowDownload) {
    downloadEl.href = `/d/${token}/file`;
    downloadEl.textContent = `Download (${formatSize(info.sizeBytes)})`;
    downloadEl.hidden = false;
  }

  let pdf: PDFDocumentProxy;
  let firstPage: PDFPageProxy;
  try {
    pdf = await getDocument({
      url: `/d/${token}/pdf`,
      withCredentials: false,
      useWasm: false,
      enableXfa: false,
      standardFontDataUrl: `${ASSETS}standard_fonts/`,
      cMapUrl: `${ASSETS}cmaps/`,
      iccUrl: `${ASSETS}iccs/`,
      wasmUrl: `${ASSETS}wasm/`,
    }).promise;
    firstPage = await pdf.getPage(1);
  } catch (error) {
    if (isUnreadablePdf(error)) {
      // A broken file stays broken: no retry advice and no download of a file that cannot be opened.
      downloadEl.hidden = true;
      downloadEl.removeAttribute('href');
      showStatus(CANNOT_DISPLAY);
    } else {
      showStatus(TRY_LATER);
    }
    return;
  }

  statusEl.hidden = true;
  const viewer = new Viewer(pdf, firstPage);
  viewer.mount();
  for (const button of [zoomIn, zoomOut, zoomFit]) button.disabled = false;
  zoomIn.addEventListener('click', () => viewer.step(1));
  zoomOut.addEventListener('click', () => viewer.step(-1));
  zoomFit.addEventListener('click', () => viewer.setZoom(1));
  docEl.focus({ preventScroll: true });

  const heartbeat = new Heartbeat({
    viewId: crypto.randomUUID(),
    now: () => performance.now(),
    visible: () => document.visibilityState === 'visible',
    state: () => ({ page: viewer.current, pagesViewed: [...viewer.viewed], pageCount: viewer.pageCount }),
    send: (payload, final) => sendBeat(token, payload, final),
  });
  document.addEventListener('visibilitychange', () => heartbeat.visibilityChanged());
  window.addEventListener('pagehide', () => heartbeat.finish());
  heartbeat.start();
}

void start();
