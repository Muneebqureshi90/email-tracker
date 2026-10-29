// Builds the MailPulse extension into dist/. Load dist/ in Chrome as an unpacked extension.
// The InboxSDK App ID comes from MAILPULSE_INBOXSDK_APP_ID (environment or infra/.env).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeIcons } from './icons.mjs';

process.chdir(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const PLACEHOLDER_APP_ID = 'sdk_mailpulse_unregistered';

function readAppId() {
  const fromEnv = process.env.MAILPULSE_INBOXSDK_APP_ID?.trim();
  if (fromEnv) return fromEnv;
  const envFile = path.join('..', 'infra', '.env');
  if (fs.existsSync(envFile)) {
    const match = /^MAILPULSE_INBOXSDK_APP_ID=(.*)$/m.exec(fs.readFileSync(envFile, 'utf8'));
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return PLACEHOLDER_APP_ID;
}

const appId = readAppId();
if (!/^[A-Za-z0-9_-]{1,100}$/.test(appId)) throw new Error('MAILPULSE_INBOXSDK_APP_ID has unexpected characters');
if (appId === PLACEHOLDER_APP_ID) {
  console.warn('InboxSDK App ID not set: Gmail shows a "register your App ID" bar. Register for free at');
  console.warn('https://www.inboxsdk.com/register, put MAILPULSE_INBOXSDK_APP_ID=<id> in infra\\.env and rebuild.');
}

fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync(path.join('dist', 'icons'), { recursive: true });
await esbuild.build({
  entryPoints: {
    content: 'src/gmail/content.ts',
    background: 'src/background/index.ts',
    popup: 'src/popup/main.tsx',
    options: 'src/options/main.tsx',
  },
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  outdir: 'dist',
  jsx: 'automatic',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  define: {
    __APP_ID__: JSON.stringify(appId),
    __VERSION__: JSON.stringify(pkg.version),
    'process.env.NODE_ENV': '"production"',
  },
});

const manifest = JSON.parse(fs.readFileSync(path.join('static', 'manifest.json'), 'utf8'));
manifest.version = pkg.version;
fs.writeFileSync(path.join('dist', 'manifest.json'), JSON.stringify(manifest, null, 2));
for (const file of ['popup.html', 'options.html', 'ui.css']) {
  fs.copyFileSync(path.join('static', file), path.join('dist', file));
}
fs.copyFileSync(path.join('node_modules', '@inboxsdk', 'core', 'pageWorld.js'), path.join('dist', 'pageWorld.js'));
writeIcons(path.join('dist', 'icons'));
console.log(`Built extension ${pkg.version} into dist/ (InboxSDK App ID ${appId === PLACEHOLDER_APP_ID ? 'NOT SET' : 'set'})`);
