// EMBERLINE, the hand-in program (Node 22, standard library only). The game is
// this directory's game/ folder — plain static files the browser loads as ES
// modules, three.js from an import map — and this program copies game/ and
// screenshots/ beside it to /output and writes /output/dossier.json, the summary
// the judge reads, with the vendored make.fun library.
//
// Play it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync as copySync, existsSync as exists, mkdirSync as makeDir, writeFileSync as writeFile } from 'node:fs';
import { join as joinPath } from 'node:path';
import { fileURLToPath as toPath } from 'node:url';
import { buildDossier as makeDossier } from './vendor/makefun-threejs.ts';

const base = toPath(new URL('.', import.meta.url));
const dest = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyIf(from, to, onlyIfPresent = false) {
  if (onlyIfPresent && !exists(from)) return;
  copySync(from, to, { recursive: true });
}

makeDir(dest, { recursive: true });
copyIf(joinPath(base, 'game'), joinPath(dest, 'game'));
makeDir(joinPath(dest, 'screenshots'), { recursive: true });
copyIf(joinPath(base, 'screenshots'), joinPath(dest, 'screenshots'), true);

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse — more than 4
// screenshots or one over 256 KiB, more than 993 files in game/ or 48 MiB of
// game files in all. game/ counts beside /output's own 1,000-entry cap, with
// its screenshots/ and dossier.json, so leave them room.
writeFile(
  joinPath(dest, 'dossier.json'),
  makeDossier(dest, {
    text_max_bytes: 160 * 1024,
    screenshots: { max: 4, max_bytes: 256 * 1024 },
    game_max_files: 993,
    game_max_bytes: 48 * 1024 * 1024,
  }),
);
