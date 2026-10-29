// Throwaway request logger for MailPulse Step 1 spikes. Not product code.
//
// Public port (default 127.0.0.1:8081, reached through Tailscale Funnel):
//   GET/HEAD /t/<token>.gif -> 43-byte transparent GIF with no-cache headers; anything else -> 404.
// Private port (default 127.0.0.1:8090, never exposed):
//   GET /health, POST /ext-log (JSON from the spike extension), POST /mark (plain-text label).
// Every request is appended as one JSON line to spikes/out/requests-<date>.jsonl.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', 'out');
fs.mkdirSync(outDir, { recursive: true });
const logFile = path.join(outDir, `requests-${new Date().toISOString().slice(0, 10)}.jsonl`);

const PUBLIC_PORT = Number(process.env.SPIKE_PUBLIC_PORT ?? 8081);
const PRIVATE_PORT = Number(process.env.SPIKE_PRIVATE_PORT ?? 8090);
const MAX_BODY = 64 * 1024;

// Smallest transparent GIF89a (43 bytes, colour 0 transparent).
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
const PIXEL_PATH = /^\/t\/([A-Za-z0-9_-]{8,64})\.gif$/;

function write(entry) {
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
}

function base(req, port) {
  return {
    at: new Date().toISOString(),
    atMs: Date.now(),
    port,
    method: req.method,
    url: req.url,
    httpVersion: req.httpVersion,
    remote: req.socket.remoteAddress,
    headers: req.headers,
  };
}

function short(ua) {
  return (ua ?? '-').slice(0, 70);
}

const publicServer = http.createServer((req, res) => {
  const entry = base(req, PUBLIC_PORT);
  const pathname = new URL(req.url, 'http://local').pathname;
  const match = PIXEL_PATH.exec(pathname);
  if ((req.method === 'GET' || req.method === 'HEAD') && match) {
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': GIF.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    res.end(req.method === 'HEAD' ? undefined : GIF);
    entry.kind = 'pixel';
    entry.token = match[1];
  } else {
    res.writeHead(404, { 'Content-Length': 0 });
    res.end();
    entry.kind = 'not-found';
  }
  write(entry);
  console.log(`${entry.at} PUBLIC ${req.method} ${pathname} ${entry.kind} ua=${short(req.headers['user-agent'])}`);
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

const privateServer = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://local').pathname;
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    if (req.method === 'GET' && pathname === '/health') {
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, logFile }));
      return;
    }
    if (req.method === 'POST' && pathname === '/ext-log') {
      const body = JSON.parse(await readBody(req));
      const entry = { at: new Date().toISOString(), atMs: Date.now(), port: PRIVATE_PORT, kind: 'ext', ...body };
      write(entry);
      console.log(`${entry.at} EXT ${body.ev ?? '?'}`);
      res.writeHead(204, cors);
      res.end();
      return;
    }
    if (req.method === 'POST' && pathname === '/mark') {
      const label = (await readBody(req)).trim().slice(0, 200);
      const entry = { at: new Date().toISOString(), atMs: Date.now(), port: PRIVATE_PORT, kind: 'mark', label };
      write(entry);
      console.log(`${entry.at} MARK ${label}`);
      res.writeHead(204, cors);
      res.end();
      return;
    }
    res.writeHead(404, cors);
    res.end();
  } catch (err) {
    res.writeHead(400, { ...cors, 'Content-Type': 'text/plain' });
    res.end(String(err.message));
  }
});

publicServer.listen(PUBLIC_PORT, '127.0.0.1', () => console.log(`public  http://127.0.0.1:${PUBLIC_PORT}`));
privateServer.listen(PRIVATE_PORT, '127.0.0.1', () => console.log(`private http://127.0.0.1:${PRIVATE_PORT}`));
console.log(`logging to ${logFile}`);
