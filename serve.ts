// A tiny static server for game/ (Node 22, standard library only), so the game
// can be played locally without a build step: `node serve.ts` serves game/ on
// http://localhost:8080. It sends the MIME types a browser game needs, refuses
// any path outside game/, and otherwise does nothing clever: a development
// convenience, not a web server for the internet.
import { createReadStream as streamFile, statSync as statFile } from 'node:fs';
import { createServer as startServer } from 'node:http';
import { extname as fileExt, join as joinPath, normalize as cleanPath, resolve as absPath, sep as pathSep } from 'node:path';
import { fileURLToPath as toPath } from 'node:url';

const base = absPath(toPath(new URL('./game', import.meta.url)));
const argv = process.argv.slice(2);
const flag = argv.indexOf('--port');
const want = flag === -1 ? 8080 : Number(argv[flag + 1]);
const listenOn = Number.isInteger(want) && want > 0 && want < 65536 ? want : 8080;

const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".wav": "audio/wav",
};

function deny(response, code, message) {
  response.writeHead(code).end(message);
}

function serve(request, response) {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let route;
  try {
    route = decodeURIComponent(url.pathname);
  } catch {
    deny(response, 400, 'bad request');
    return;
  }
  if (route.endsWith('/')) route += 'index.html';
  const file = absPath(joinPath(base, cleanPath(route)));
  if (file !== base && !file.startsWith(base + pathSep)) {
    deny(response, 403, 'forbidden');
    return;
  }
  let size;
  try {
    const stats = statFile(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    deny(response, 404, 'not found');
    return;
  }
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-length": size,
    "content-type": TYPES[fileExt(file).toLowerCase()] ?? "application/octet-stream",
  });
  streamFile(file).pipe(response);
}

startServer(serve).listen(listenOn, '127.0.0.1', () => {
  console.log(`game/ is on http://localhost:${listenOn}`);
});
