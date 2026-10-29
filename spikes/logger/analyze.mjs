// Summarises Step 1 spike evidence. Throwaway; not product code.
// Usage: node spikes/logger/analyze.mjs            (reads spikes/out/*.jsonl and spikes/out/*.eml)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'out');
const files = fs.readdirSync(outDir);
const rows = files
  .filter((f) => f.endsWith('.jsonl'))
  .flatMap((f) => fs.readFileSync(path.join(outDir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)))
  .sort((a, b) => a.atMs - b.atMs);

const pixels = rows.filter((r) => r.kind === 'pixel');
const ext = rows.filter((r) => r.kind === 'ext');
const marks = rows.filter((r) => r.kind === 'mark');
const time = (ms) => new Date(ms).toISOString().slice(11, 23);
const short = (token) => (token ?? '').slice(0, 8);

function source(r) {
  const ua = r.headers?.['user-agent'] ?? '';
  if (/GoogleImageProxy/i.test(ua)) return 'gmail-proxy';
  if (/YahooMailProxy/i.test(ua)) return 'yahoo-proxy';
  if (/curl\//i.test(ua)) return 'curl';
  if (/Microsoft|Outlook|Office/i.test(ua)) return 'microsoft';
  return 'other';
}
function clientIp(r) {
  const ip = (r.headers?.['x-forwarded-for'] ?? r.remote ?? '').split(',')[0].trim();
  const v4 = /^(\d+\.\d+\.\d+)\.\d+$/.exec(ip);
  return v4 ? `${v4[1]}.0/24` : ip.split(':').slice(0, 3).join(':') + '::/48';
}
function section(title) {
  console.log(`\n== ${title}`);
}

section('Timeline');
for (const r of rows) {
  if (r.kind === 'mark') console.log(`${time(r.atMs)} MARK  ${r.label}`);
  else if (r.kind === 'pixel') {
    console.log(`${time(r.atMs)} PIXEL ${r.method} ${short(r.token)} ${source(r)} ip=${clientIp(r)} ua="${(r.headers?.['user-agent'] ?? '').slice(0, 70)}"`);
  } else if (r.kind === 'ext' && !/^(route|webRequest\.proxyWithoutFragment)$/.test(r.ev)) {
    const { ev, at, atMs, port, kind, pageAtMs, swAtMs, tabId, ...rest } = r;
    console.log(`${time(r.atMs)} EXT   ${ev} ${JSON.stringify(rest).slice(0, 220)}`);
  }
}

section('Pixel fetches per token');
const sentByToken = new Map(ext.filter((e) => e.ev === 'compose.sent').map((e) => [e.token, e]));
const byToken = Map.groupBy(pixels, (p) => p.token);
for (const [token, list] of byToken) {
  const sent = sentByToken.get(token);
  const first = list[0];
  const afterSend = sent ? `${((first.atMs - sent.sentEventAtMs) / 1000).toFixed(1)} s after 'sent'` : 'no sent event';
  const sources = Object.entries(Object.groupBy(list, source)).map(([k, v]) => `${k}×${v.length}`).join(' ');
  console.log(`${short(token)} code=${sent?.code ?? '?'} fetches=${list.length} [${sources}] first=${afterSend} methods=${[...new Set(list.map((p) => p.method))].join('/')}`);
}
const headerNames = new Set(pixels.flatMap((p) => Object.keys(p.headers ?? {})));
console.log(`Header names seen on pixel requests: ${[...headerNames].sort().join(', ')}`);
console.log(`User agents seen: ${[...new Set(pixels.map((p) => p.headers?.['user-agent'] ?? '-'))].map((ua) => `\n  ${ua}`).join('')}`);

section('Self-view report vs proxy fetch (hold-window test, D-037)');
const deltas = [];
for (const view of ext.filter((e) => e.ev === 'selfview')) {
  for (const token of view.tokens ?? []) {
    const near = pixels.filter((p) => p.token === token && Math.abs(p.atMs - view.atMs) <= 60_000);
    for (const p of near) {
      const delta = p.atMs - view.atMs;
      deltas.push(delta);
      console.log(`${short(token)} ${view.context}: fetch ${delta >= 0 ? 'after' : 'BEFORE'} report by ${Math.abs(delta)} ms (${source(p)})`);
    }
  }
}
if (deltas.length) {
  const worst = Math.max(...deltas.map(Math.abs));
  const verdict = worst + 3000 <= 15_000 ? 'use 15 s' : 'keep 30 s';
  console.log(`samples=${deltas.length} worst |gap|=${worst} ms -> ${verdict} (rule: worst gap + 3 s margin must fit in 15 s)`);
} else {
  console.log('No self-view report matched a pixel fetch within 60 s.');
}

section('DNR self-view rules and fragment visibility');
const matches = ext.filter((e) => e.ev === 'dnr.match');
for (const [ruleId, list] of Object.entries(Object.groupBy(matches, (m) => m.ruleId))) {
  console.log(`rule ${ruleId}: ${list.length} match(es); url had #fragment: ${list.some((m) => m.urlHasFragment)}`);
}
const regex = ext.find((e) => e.ev === 'dnr.regexSupported');
console.log(`Proxy regex supported: ${regex ? regex.isSupported : 'not logged'}`);
console.log(`webRequest saw proxy URLs with our #fragment: ${ext.filter((e) => e.ev === 'webRequest.proxyImage').length}`);
const modes = ext.filter((e) => e.ev === 'dnr.applied').map((e) => `${time(e.atMs)} ${e.mode}`);
console.log(`DNR mode changes: ${modes.join(', ') || 'none'}`);

section('InboxSDK telemetry');
const telemetryBlocked = matches.filter((m) => m.ruleId <= 2).length;
const leaks = ext.filter((e) => e.ev === 'webRequest.completed' && /inboxsdk\.com|mailfoogae/.test(e.url));
console.log(`Blocked attempts: ${telemetryBlocked}; completed requests (leaks): ${leaks.length}`);
for (const leak of leaks) console.log(`  LEAK ${leak.url}`);
const loadErrors = ext.filter((e) => e.ev === 'sdk.loadError');
console.log(`SDK loaded: ${ext.some((e) => e.ev === 'sdk.loaded')}; load errors: ${loadErrors.length}`);

section('Worker -> 127.0.0.1 (Local Network Access)');
for (const e of ext.filter((x) => x.ev === 'lna.health')) console.log(`${time(e.atMs)} ok=${e.ok} error=${e.error}`);
console.log('(If the logger never received anything, check the popup: it shows the fetch error.)');

section('Gmail IDs');
for (const s of ext.filter((e) => e.ev === 'compose.sent')) {
  const row = ext.find((e) => e.ev === 'threadRow.match' && e.threadId === s.threadId);
  const view = ext.find((e) => e.ev === 'message.view' && e.messageId === s.messageId);
  console.log(`${s.code ?? '?'} message=${s.messageId} thread=${s.threadId} error=${s.error} | Sent-row match: ${Boolean(row)} | message view match: ${Boolean(view)}`);
}
for (const m of marks) {
  const perm = /msg-f:(\d+)/.exec(m.label);
  if (perm) console.log(`Show-original id msg-f:${perm[1]} = hex ${BigInt(perm[1]).toString(16)} (compare with message ids above)`);
}

section('Sent email bodies (.eml from "Show original" → "Download original")');
const PIXEL_TAG = /<img[^>]*\/t\/[A-Za-z0-9_-]{8,64}\.gif[^>]*>/gi;
function decodeQuotedPrintable(text) {
  const latin = text.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return Buffer.from(latin, 'latin1').toString('utf8');
}
function part(eml, type) {
  const start = eml.search(new RegExp(`^Content-Type:\\s*${type}`, 'im'));
  if (start < 0) return null;
  const rest = eml.slice(start);
  const split = /\r?\n\r?\n/.exec(rest);
  const headers = rest.slice(0, split.index);
  let body = rest.slice(split.index + split[0].length);
  const boundary = body.search(/^--\S+/m);
  if (boundary >= 0) body = body.slice(0, boundary);
  const encoding = /Content-Transfer-Encoding:\s*([\w-]+)/i.exec(headers)?.[1]?.toLowerCase();
  if (encoding === 'quoted-printable') body = decodeQuotedPrintable(body);
  if (encoding === 'base64') body = Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  return body.trim();
}
const emls = files.filter((f) => f.toLowerCase().endsWith('.eml')).sort();
const control = emls.find((f) => /S1-A/i.test(f));
if (!emls.length) console.log('No .eml files saved yet.');
for (const file of emls) {
  const eml = fs.readFileSync(path.join(outDir, file), 'utf8');
  const html = part(eml, 'text/html') ?? '';
  const plain = part(eml, 'text/plain') ?? '';
  const tags = html.match(PIXEL_TAG) ?? [];
  console.log(`\n${file}: html=${html.length} chars, pixels=${tags.length}`);
  for (const tag of tags) console.log(`  ${tag.replace(/\/t\/[A-Za-z0-9_-]+/, '/t/<token>')} at char ${html.indexOf(tag)}`);
  if (control && file !== control) {
    const base = fs.readFileSync(path.join(outDir, control), 'utf8');
    const baseHtml = (part(base, 'text/html') ?? '').replace(/\s+/g, ' ');
    const stripped = html.replace(PIXEL_TAG, '').replace(/\s+/g, ' ');
    let at = 0;
    while (at < baseHtml.length && baseHtml[at] === stripped[at]) at += 1;
    const same = baseHtml === stripped;
    console.log(`  HTML equals control after removing pixel: ${same}${same ? '' : ` (first difference at ${at}: control "${baseHtml.slice(at, at + 60)}" vs "${stripped.slice(at, at + 60)}")`}`);
    const basePlain = (part(base, 'text/plain') ?? '').replace(/\s+/g, ' ');
    console.log(`  Plain-text part equals control: ${basePlain === plain.replace(/\s+/g, ' ')}`);
  }
}
