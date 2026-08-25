#!/usr/bin/env node
/* Research Hub - standalone server.
 *
 * One Node process that serves the built dashboard and answers /api. It has no
 * dependencies beyond Node itself and no framework, so it runs unchanged on a
 * plain VPS, in Docker, on Render, Railway, Fly.io, Cloud Run, Heroku, or on
 * shared hosting with Node support (cPanel, Plesk).
 *
 *     npm run build      # only after editing src/index.html
 *     npm start          # reads .env if present, then listens
 *
 * Settings come from the environment, or from a .env file in this folder if
 * the host has no environment-variable panel. See .env.example.
 *
 * Only the built dashboard is served: index.html, app-<hash>.js and .css, and a small set of
 * optional PWA files. Everything else in this folder, including .env, src/ and
 * lib/, is unreachable over HTTP. That is deliberate - do not replace this with
 * a directory-wide static handler.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeHandler, config } from './api/index.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

/* ── .env loader ──
 * Deliberately small: KEY=value per line, # starts a comment, surrounding
 * quotes are stripped. Real environment variables always win. */
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === '') process.env[key] = val;
  }
}
loadDotEnv();

const PORT = Number(process.env.PORT || process.env.RH_PORT || 3000);
const HOST = process.env.HOST || process.env.RH_HOST || '0.0.0.0';
const BASE = (process.env.RH_BASE_PATH || '').replace(/\/+$/, '');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js'  : 'text/javascript; charset=utf-8',
  '.css' : 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png' : 'image/png',
  '.svg' : 'image/svg+xml',
  '.ico' : 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

/* Files that may be served from the project root. The built bundles app-<hash>.js
   and app-<hash>.css are matched by pattern instead of being listed, because
   their names change with every build. All are
 * optional; a missing one simply returns 404. */
const ROOT_FILES = new Set([
  'index.html', 'sw.js', 'pdf-lib.min.js', 'manifest.json', 'manifest.webmanifest',
  'favicon.ico', 'robots.txt', 'icon-192.png', 'icon-512.png', 'icon-180.png'
]);
const BUNDLE = /^app-[0-9a-f]{8}\.(js|css)$/;

function send(res, status, type, body, extra) {
  res.writeHead(status, Object.assign({ 'Content-Type': type }, extra || {}));
  res.end(body);
}

function serveFile(res, file, immutable) {
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    send(res, 200, type, data, {
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
  });
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch (e) { return send(res, 400, 'text/plain; charset=utf-8', 'Bad request'); }

  if (BASE && pathname.startsWith(BASE)) pathname = pathname.slice(BASE.length) || '/';

  if (pathname === '/api' || pathname === '/api/' || pathname.startsWith('/api/')) {
    try { return await nodeHandler(req, res); }
    catch (e) {
      console.error('[research-hub] ' + (e && e.message ? e.message : e));
      return send(res, 200, 'application/json; charset=utf-8',
        JSON.stringify({ ok: false, error: 'Internal error' }), { 'Cache-Control': 'no-store' });
    }
  }

  if (pathname === '/healthz') {
    return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true }));
  }

  const name = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');

  /* Fingerprinted bundles, cached forever by the browser because a new build
     produces a new filename. */
  if (BUNDLE.test(name)) return serveFile(res, path.join(ROOT, name), true);

  if (name.startsWith('.') || name.includes('/.')) {
    return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
  }
  if (ROOT_FILES.has(name)) return serveFile(res, path.join(ROOT, name), false);

  /* The dashboard routes with the history API, so any unknown path that is not
     a file request is answered with the shell and resolved in the browser. */
  if (!path.extname(name)) return serveFile(res, path.join(ROOT, 'index.html'), false);

  return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
});

server.listen(PORT, HOST, () => {
  const K = config();
  console.log('Research Hub listening on http://' + HOST + ':' + PORT + (BASE || ''));
  if (!K.secret) console.warn('WARNING: RH_SESSION_SECRET is empty. Nobody will be able to sign in.');
  if (!K.gasUrl) console.warn('WARNING: RH_GAS_URL is empty. The dashboard has no data source.');
});
