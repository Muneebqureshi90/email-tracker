// Builds the throwaway spike extension into dist/ (load it unpacked in Chrome).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(path.dirname(fileURLToPath(import.meta.url)));

const cfg = JSON.parse(fs.readFileSync('spike.config.json', 'utf8'));
if (!/^https:\/\/[a-z0-9.-]+$/.test(cfg.publicBase ?? '')) {
  throw new Error('spike.config.json: publicBase must look like https://host (no trailing slash)');
}
let appId = cfg.appId;
if (!appId) {
  appId = 'sdk_mailpulse_spike_unregistered';
  console.warn('No InboxSDK appId set: Gmail will show a "register your App ID" bar. Register at https://register.inboxsdk.com/');
}

fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync('dist');
await esbuild.build({
  entryPoints: { content: 'src/content.js', background: 'src/background.js' },
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  outdir: 'dist',
  legalComments: 'none',
  logLevel: 'info',
  define: {
    __PUBLIC_BASE__: JSON.stringify(cfg.publicBase),
    __APP_ID__: JSON.stringify(appId),
    __LOG_BASE__: JSON.stringify(cfg.logBase ?? 'http://127.0.0.1:8090'),
    'process.env.NODE_ENV': '"production"',
  },
});
for (const file of fs.readdirSync('static')) fs.copyFileSync(path.join('static', file), path.join('dist', file));
fs.copyFileSync(path.join('node_modules', '@inboxsdk', 'core', 'pageWorld.js'), path.join('dist', 'pageWorld.js'));
console.log(`Built dist/ for ${cfg.publicBase}`);
