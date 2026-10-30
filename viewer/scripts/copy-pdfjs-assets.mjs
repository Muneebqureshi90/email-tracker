// Copies the PDF.js data files the viewer loads at run time (fonts, character maps, colour profiles,
// image decoders) into public/, so they are served from the same origin under /d/_/ with no CDN.
// public/ copies are build output: they are git-ignored and recreated on every build.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', 'pdfjs-dist');
const target = join(root, 'public');

// quickjs runs JavaScript embedded in PDFs; the viewer never enables PDF scripting. The .wasm decoders are
// left out too: the viewer runs PDF.js with useWasm: false (the JavaScript fallbacks), so its CSP needs no
// 'wasm-unsafe-eval' (docs/DECISIONS.md D-130).
const skip = (path) => /quickjs/i.test(path) || path.endsWith('.wasm');

for (const folder of ['standard_fonts', 'cmaps', 'iccs', 'wasm']) {
  const from = join(source, folder);
  const to = join(target, folder);
  if (!existsSync(from)) throw new Error(`pdfjs-dist has no ${folder} folder; check the pdfjs-dist version.`);
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true, filter: (path) => !skip(path) });
}
