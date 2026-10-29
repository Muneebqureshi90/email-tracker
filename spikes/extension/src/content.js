// Throwaway MailPulse Step 1 spike: content script running in Gmail. Not product code.
// Only emails whose subject contains a test code like "[S1-B]" are touched (DECISIONS D-039).
// Logs structure and timings only: no body text, no subjects, no addresses.
import * as InboxSDK from '@inboxsdk/core';

const PUBLIC_BASE = __PUBLIC_BASE__;
const APP_ID = __APP_ID__;
const PIXEL_PREFIX = `${PUBLIC_BASE}/t/`;
const CODE_RE = /\[(S\d-[A-Z0-9]{1,3})\]/;
const QUOTE_SELECTOR = '.gmail_quote, blockquote';
const CHECK_ICON =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'>" +
  "<path d='M2 8.5l3.5 3.5L14 3.5' fill='none' stroke='%2316a34a' stroke-width='2'/></svg>";

let settings = { insertPixel: true, sendMode: 'presync', stripQuoted: true };
chrome.storage.local.get('settings').then(({ settings: saved }) => {
  if (saved) settings = { ...settings, ...saved };
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings?.newValue) settings = { ...settings, ...changes.settings.newValue };
});

function log(ev, data = {}) {
  chrome.runtime.sendMessage({ type: 'spike-log', entry: { ev, pageAtMs: Date.now(), ...data } }).catch(() => {});
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
}

// Accepts a direct pixel URL or Gmail's proxy form ".../meips/...#<original URL>".
function parsePixelSrc(src) {
  if (!src) return null;
  let url = src;
  let form = 'direct';
  const hash = src.indexOf('#');
  if (hash > 0 && src.slice(0, hash).includes('googleusercontent.com')) {
    url = src.slice(hash + 1);
    form = 'proxy';
    if (!url.startsWith('http')) {
      try {
        url = decodeURIComponent(url);
      } catch {
        return null;
      }
    }
  }
  if (!url.startsWith(PIXEL_PREFIX)) return null;
  const match = /^([A-Za-z0-9_-]{8,64})\.gif/.exec(url.slice(PIXEL_PREFIX.length));
  return match ? { token: match[1], form } : null;
}

function findPixels(root) {
  return [...root.querySelectorAll('img')]
    .map((el) => ({ el, parsed: parsePixelSrc(el.getAttribute('src')) }))
    .filter((p) => p.parsed)
    .map((p) => ({ el: p.el, token: p.parsed.token, form: p.parsed.form }));
}

const inQuote = (el) => Boolean(el.closest(QUOTE_SELECTOR));

function firstTextBlock(body) {
  for (const node of body.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) return null;
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    if (node.matches(`${QUOTE_SELECTOR}, .gmail_signature, .gmail_signature_prefix`)) return null;
    if (node.tagName === 'DIV' || node.tagName === 'P') return node;
  }
  return null;
}

function insertPixel(body, token) {
  const img = document.createElement('img');
  img.setAttribute('src', `${PIXEL_PREFIX}${token}.gif`);
  img.setAttribute('width', '1');
  img.setAttribute('height', '1');
  img.setAttribute('alt', '');
  img.setAttribute('style', 'width:1px;height:1px;border:0');
  const block = firstTextBlock(body);
  if (block) block.insertBefore(img, block.firstChild);
  else body.insertBefore(img, body.firstChild);
  return block ? 'first-block' : 'body-start';
}

// Structural facts only, to learn how plain-text and confidential mode look in the DOM.
function probe(composeView) {
  const body = composeView.getBodyElement();
  const html = composeView.getHTMLContent();
  const root = body.closest('[role="dialog"]') ?? body.closest('table') ?? body.parentElement;
  const outsideText = (root?.innerText ?? '').replace(body.innerText, '');
  return {
    bodyClass: body.className,
    bodyAttrs: [...body.attributes].map((a) => a.name).join(','),
    htmlHasTags: /<(div|p|span|a|img|b|i|u|font|br)\b/i.test(html),
    htmlLength: html.length,
    quoteBlocks: body.querySelectorAll(QUOTE_SELECTOR).length,
    images: body.querySelectorAll('img').length,
    confidentialHint: /confidential|expires/i.test(outsideText),
  };
}

function applyTracking(composeView, ctx) {
  const body = composeView.getBodyElement();
  const before = findPixels(body);
  const quoted = before.filter((p) => inQuote(p.el));
  let removedQuoted = 0;
  if (settings.stripQuoted) {
    for (const p of quoted) {
      p.el.remove();
      removedQuoted += 1;
    }
  }
  const own = findPixels(body).filter((p) => !inQuote(p.el));
  let placement = null;
  if (own.length === 0) placement = insertPixel(body, ctx.token);
  else ctx.token = own[0].token;
  return {
    token: ctx.token,
    inserted: placement !== null,
    placement,
    quotedPixelsSeen: quoted.length,
    quotedForms: quoted.map((p) => p.form),
    removedQuoted,
    ownPixelsBefore: own.length,
  };
}

function handleCompose(composeView) {
  const ctx = { composeId: newToken().slice(0, 8), token: newToken(), adopted: false, resending: false, code: null };
  const subjectCode = () => CODE_RE.exec(composeView.getSubject() ?? '')?.[1] ?? null;

  const existing = findPixels(composeView.getBodyElement());
  const ownExisting = existing.filter((p) => !inQuote(p.el));
  if (ownExisting.length) {
    ctx.token = ownExisting[0].token;
    ctx.adopted = true;
  }
  log('compose.open', {
    composeId: ctx.composeId,
    isReply: composeView.isReply(),
    isForward: composeView.isForward(),
    isInline: composeView.isInlineReplyForm(),
    adoptedToken: ctx.adopted ? ctx.token : null,
    pixels: existing.map((p) => ({ token: p.token, form: p.form, quoted: inQuote(p.el) })),
  });
  if (existing.length) {
    log('selfview', { context: 'COMPOSE', tokens: [...new Set(existing.map((p) => p.token))] });
  }

  composeView.on('presending', (event) => {
    const code = subjectCode();
    if (!code) {
      log('compose.presending.skip', { composeId: ctx.composeId, reason: 'no test code' });
      return;
    }
    ctx.code = code;
    if (!settings.insertPixel) {
      log('compose.presending.skip', { composeId: ctx.composeId, code, reason: 'insertPixel off', ...probe(composeView) });
      return;
    }
    if (ctx.resending) {
      ctx.resending = false;
      log('compose.presending.resendPass', { composeId: ctx.composeId, code });
      return;
    }
    if (settings.sendMode === 'cancelResend') {
      event.cancel();
      log('compose.presending.cancelled', { composeId: ctx.composeId, code });
      setTimeout(() => {
        const result = applyTracking(composeView, ctx);
        ctx.resending = true;
        log('compose.resend', { composeId: ctx.composeId, code, ...result });
        composeView.send();
      }, 800); // simulated backend round trip
      return;
    }
    const t0 = performance.now();
    const result = applyTracking(composeView, ctx);
    const ms = Number((performance.now() - t0).toFixed(2));
    log('compose.presending.applied', { composeId: ctx.composeId, code, mode: 'presync', ms, ...result, ...probe(composeView) });
  });

  composeView.on('sending', () => log('compose.sending', { composeId: ctx.composeId, code: ctx.code }));
  composeView.on('sent', async (event) => {
    const sentEventAtMs = Date.now();
    let messageId = null;
    let threadId = null;
    let error = null;
    try {
      [messageId, threadId] = await Promise.all([event.getMessageID(), event.getThreadID()]);
    } catch (err) {
      error = String(err?.message ?? err);
    }
    log('compose.sent', { composeId: ctx.composeId, code: ctx.code, token: ctx.token, messageId, threadId, error, sentEventAtMs });
    const { sent = [] } = await chrome.storage.local.get('sent');
    sent.push({ threadId, messageId, token: ctx.token, code: ctx.code, at: sentEventAtMs });
    await chrome.storage.local.set({ sent: sent.slice(-200) });
  });
  composeView.on('sendCanceled', () =>
    log('compose.sendCanceled', { composeId: ctx.composeId, code: ctx.code, token: ctx.token }),
  );
  composeView.on('scheduleSendMenuOpening', () =>
    log('compose.scheduleSendMenuOpening', { composeId: ctx.composeId, code: subjectCode() }),
  );
  composeView.on('discard', () => log('compose.discard', { composeId: ctx.composeId }));
  composeView.on('destroy', (data) =>
    log('compose.destroy', { composeId: ctx.composeId, messageID: data?.messageID ?? null, closedByInboxSDK: data?.closedByInboxSDK ?? null }),
  );
}

function handleMessageView(messageView, userEmail) {
  let reported = false;
  const inspect = async (trigger) => {
    if (!messageView.isLoaded()) return;
    const pixels = findPixels(messageView.getBodyElement());
    if (pixels.length && !reported) {
      reported = true;
      // Sent first: the report must race Google's proxy fetch (Spike 3 measures the gap).
      log('selfview', { context: 'THREAD', trigger, tokens: [...new Set(pixels.map((p) => p.token))] });
    }
    const messageId = await messageView.getMessageIDAsync().catch((err) => `ERR ${err?.message ?? err}`);
    const fromSelf = (messageView.getSender()?.emailAddress ?? '').toLowerCase() === userEmail;
    log('message.view', {
      trigger,
      messageId,
      viewState: messageView.getViewState(),
      fromSelf,
      pixels: pixels.map((p) => ({ token: p.token, form: p.form, quoted: messageView.isElementInQuotedArea(p.el) })),
    });
  };
  inspect('handler');
  messageView.on('load', () => inspect('load'));
  messageView.on('viewStateChange', (event) => {
    log('message.viewStateChange', { from: event.oldViewState, to: event.newViewState });
    if (event.newViewState === 'EXPANDED') {
      reported = false;
      inspect('expanded');
    }
  });
}

async function handleThreadRow(row) {
  const threadId = await row.getThreadIDAsync().catch(() => null);
  if (!threadId) return;
  const { sent = [] } = await chrome.storage.local.get('sent');
  const hits = sent.filter((s) => s.threadId === threadId);
  if (!hits.length) return;
  const last = hits[hits.length - 1];
  row.addImage({ imageUrl: CHECK_ICON, tooltip: `MailPulse spike ${last.code ?? '?'} · token ${last.token.slice(0, 6)}…` });
  log('threadRow.match', { threadId, code: last.code, token: last.token, visibleMessages: row.getVisibleMessageCount() });
}

InboxSDK.load(2, APP_ID, { appName: 'MailPulse spike', eventTracking: false, globalErrorLogging: false })
  .then((sdk) => {
    const userEmail = sdk.User.getEmailAddress().toLowerCase();
    log('sdk.loaded', { accountPath: location.pathname.slice(0, 12) });
    sdk.Compose.registerComposeViewHandler(handleCompose);
    sdk.Conversations.registerMessageViewHandler((mv) => handleMessageView(mv, userEmail));
    sdk.Lists.registerThreadRowViewHandler((row) => {
      handleThreadRow(row).catch((err) => log('threadRow.error', { error: String(err?.message ?? err) }));
    });
    sdk.Router.handleAllRoutes((routeView) =>
      log('route', { routeId: routeView.getRouteID(), routeType: routeView.getRouteType() }),
    );
  })
  .catch((err) => log('sdk.loadError', { error: String(err?.message ?? err) }));
