/* Research Hub API. One file, no imports beyond Node's own crypto.
 *
 * On Vercel this is the only server-side code that runs. The platform turns any
 * file under /api into a serverless function, which is why this one folder
 * exists while everything else sits in the project root. The default export at
 * the bottom is the entry point Vercel calls; the rest of the file is the logic
 * itself, and server.js imports the same functions when you run locally.
 *
 * Required environment variables, set in the Vercel dashboard:
 *   RH_GAS_URL          the Apps Script Web App address ending in /exec
 *   RH_SESSION_SECRET   a long random string used to sign the session cookie
 * Optional:
 *   RH_GAS_TOKEN        only when the TOKEN variable in Code.gs is set
 */

import crypto from 'node:crypto';

/* ── configuration ──────────────────────────────────────────────────────────
 * Read from the environment. The older Indonesian variable names are still
 * accepted so an existing deployment keeps working after this upgrade.
 */
function env(name, legacy, fallback) {
  const v = process.env[name] !== undefined && process.env[name] !== ''
    ? process.env[name]
    : (legacy && process.env[legacy] !== undefined && process.env[legacy] !== ''
      ? process.env[legacy] : undefined);
  return v === undefined ? fallback : v;
}

export function config() {
  return {
    gasUrl        : String(env('RH_GAS_URL', null, '')),
    gasToken      : String(env('RH_GAS_TOKEN', null, '')),
    secret        : String(env('RH_SESSION_SECRET', null, '')),
    requireLogin  : ['no', 'tidak', 'false', '0']
                      .indexOf(String(env('RH_REQUIRE_LOGIN', 'RH_WAJIB_MASUK', 'yes')).toLowerCase()) < 0,
    sessionHours  : Number(env('RH_SESSION_HOURS', 'RH_SESI_JAM', 12)),
    maxFailed     : Number(env('RH_MAX_FAILED_LOGINS', 'RH_MAKS_GAGAL', 5)),
    lockoutMinutes: Number(env('RH_LOCKOUT_MINUTES', 'RH_KUNCI_MENIT', 30)),
    cacheSeconds  : Number(env('RH_CACHE_SECONDS', 'RH_CACHE_DETIK', 8)),
    timeoutMs     : Number(env('RH_TIMEOUT_SECONDS', 'RH_BATAS_BIASA', 45)) * 1000,
    uploadMs      : Number(env('RH_UPLOAD_TIMEOUT_SECONDS', 'RH_BATAS_UNGGAH', 120)) * 1000,
    cookieSecure  : String(env('RH_COOKIE_SECURE', null, 'auto'))
  };
}

const COOKIE_NAME = 'rh_sesi';
const WRITE_ACTIONS = ['sync', 'upload', 'ganti-nama'];

/* The dashboard matches this prefix to decide that it should hold local edits
 * and ask the user to sign in again. Do not translate or reword it: the
 * message after the prefix is what the Indonesian-language dashboard shows. */
const SESSION_EXPIRED = 'SESI_HABIS Sesi Anda berakhir. Muat ulang halaman lalu masuk lagi.';

/* ── signed session cookie ──
 * The payload is readable by its owner but cannot be modified without breaking
 * the signature, so nobody can claim to be somebody else. */
function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return body + '.' + mac;
}

function unsign(cookie, secret, sessionHours) {
  if (!cookie || !secret) return null;
  const [body, mac] = String(cookie).split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const u = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!u || (Date.now() / 1000 - Number(u.ts || 0)) > sessionHours * 3600) return null;
    return u;
  } catch (e) { return null; }
}

function readCookie(cookieHeader, name) {
  for (const part of String(cookieHeader || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function cookieHeader(value, maxAgeSeconds, secure) {
  return COOKIE_NAME + '=' + encodeURIComponent(value) +
    '; Path=/; HttpOnly; SameSite=Lax' + (secure ? '; Secure' : '') +
    '; Max-Age=' + maxAgeSeconds;
}

/* ── short-lived memory inside one running copy ── */
const memory = { pull: null, pullUntil: 0, failed: new Map() };

function failedCount(mail, lockoutMinutes) {
  const since = Date.now() - lockoutMinutes * 60000;
  const list = (memory.failed.get(mail) || []).filter(t => t >= since);
  memory.failed.set(mail, list);
  return list.length;
}

function recordFailure(mail) {
  const list = memory.failed.get(mail) || [];
  list.push(Date.now());
  memory.failed.set(mail, list);
}

/* ── call Apps Script ──
 * The Web App answers with a redirect to script.googleusercontent.com, exactly
 * as it does for a browser, so redirects must be followed. */
async function callGas(payload, timeoutMs, K) {
  if (!K.gasUrl || K.gasUrl.includes('REPLACE_WITH') || K.gasUrl.includes('GANTI_DENGAN')) {
    throw new Error('The Apps Script Web App address is not set. Define RH_GAS_URL.');
  }
  /* The token belongs to the server, never to the browser. Whatever the client
     sent in the token field is dropped first. */
  const body = JSON.stringify(Object.assign({}, payload, { token: K.gasToken, v: 2 }));

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs || K.timeoutMs);
  let res;
  try {
    res = await fetch(K.gasUrl, {
      method: 'POST', redirect: 'follow', signal: abort.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body
    });
  } catch (e) {
    throw new Error(e && e.name === 'AbortError'
      ? 'Apps Script did not answer within ' + Math.round((timeoutMs || K.timeoutMs) / 1000) + ' seconds.'
      : 'Apps Script could not be reached.');
  } finally { clearTimeout(timer); }

  const text = await res.text();
  try { return JSON.parse(text); }
  catch (e) {
    /* An HTML page in the reply usually means the deployment access is not set
       to Anyone, or the URL is not the one ending in /exec. */
    throw new Error('Apps Script replied with something other than JSON (HTTP ' + res.status +
      '). Check the deployment access setting and the /exec address.');
  }
}

/* The password column must never reach the browser. Setting
 * AKUN_SERTAKAN_SANDI to false in Code.gs is the primary defence; this filter
 * is the second one. */
function stripPasswords(out) {
  if (out && Array.isArray(out.akun)) {
    out.akun = out.akun.map(a => (a && typeof a === 'object' && 'sandi' in a)
      ? Object.assign({}, a, { sandi: '' }) : a);
  }
  return out;
}

/* An empty snapshot for visitors who have not signed in. The shape is complete
 * so the dashboard does not trip over a missing field, but it carries no data. */
function emptySnapshot() {
  const out = {
    ok: true, rev: '0', syncedAt: new Date().toISOString(),
    headers: [], rows: [], luaran: [], progres: [], referensi: [], hapus: []
  };
  for (const s of ['tugas', 'milestone', 'korespondensi', 'dokumen', 'akun', 'komentar']) out[s] = [];
  return out;
}

/**
 * Handle one API request.
 *
 * @param {object} req
 * @param {string} req.method        HTTP method.
 * @param {object} [req.query]       Parsed query string parameters.
 * @param {object} [req.body]        Parsed JSON body, or {} when there is none.
 * @param {string} [req.cookie]      Raw Cookie header.
 * @param {boolean} [req.secure]     True when the request arrived over HTTPS.
 * @returns {Promise<{status:number, headers:object, body:string}>}
 */
export async function handleRequest(req) {
  const K = config();
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  };
  const secure = K.cookieSecure === 'auto' ? req.secure !== false : K.cookieSecure !== 'false';
  const reply = (obj, extra) => ({
    status: 200,
    headers: Object.assign({}, headers, extra || {}),
    body: JSON.stringify(obj)
  });

  if (req.method === 'OPTIONS') return { status: 204, headers, body: '' };

  try {
    if (!K.secret) {
      return reply({
        ok: false,
        error: 'RH_SESSION_SECRET is not set. Without it the session cookie cannot be ' +
               'signed and nobody can sign in.'
      });
    }

    const input = Object.assign({}, req.query || {}, req.body || {});
    const action = String(input.action || '').trim();
    if (!action) return reply({ ok: false, error: 'No action given' });

    const user = unsign(readCookie(req.cookie, COOKIE_NAME), K.secret, K.sessionHours);

    /* ── sign in ── */
    if (action === 'login') {
      const mail = String(input.mail || input.email || '').trim().toLowerCase();
      if (!mail) return reply({ ok: false, error: 'Surel dan kata sandi wajib diisi.' });
      if (failedCount(mail, K.lockoutMinutes) >= K.maxFailed) {
        return reply({ ok: false, error: 'Terlalu banyak percobaan. Coba lagi setelah ' + K.lockoutMinutes + ' menit.' });
      }
      const out = await callGas(
        { action: 'login', email: mail, sandi: String(input.sandi || input.pass || '') },
        K.timeoutMs, K);
      if (!out || !out.ok) {
        recordFailure(mail);
        return reply({ ok: false, error: String((out && out.error) || 'Surel atau kata sandi tidak cocok.') });
      }
      memory.failed.delete(mail);
      const acc = out.akun || { email: mail };
      const cookie = cookieHeader(sign({
        mail : String(acc.email || mail).toLowerCase(),
        nama : String(acc.nama || ''),
        peran: String(acc.peran || ''),
        ts   : Math.floor(Date.now() / 1000)
      }, K.secret), K.sessionHours * 3600, secure);
      return reply(stripPasswords(out), { 'Set-Cookie': cookie });
    }

    if (action === 'logout') {
      return reply({ ok: true }, { 'Set-Cookie': cookieHeader('', 0, secure) });
    }

    /* ── gate ── */
    if (K.requireLogin && !user) {
      /* Writes are refused outright rather than answered as if they had
         succeeded. The dashboard keeps the change on the device and retries,
         so no edit is lost when a session expires. */
      if (action === 'pull') return reply(emptySnapshot());
      if (action === 'ping') return reply({ ok: true });
      if (action === 'cek') return reply({ ok: true, rev: '0' });
      return reply({ ok: false, error: SESSION_EXPIRED });
    }

    /* ── forwarding ── */
    if (action === 'pull') {
      if (K.cacheSeconds > 0 && memory.pull && Date.now() < memory.pullUntil) {
        return reply(memory.pull);
      }
      const out = stripPasswords(await callGas({ action: 'pull' }, K.timeoutMs, K));
      if (K.cacheSeconds > 0 && out && out.ok) {
        memory.pull = out;
        memory.pullUntil = Date.now() + K.cacheSeconds * 1000;
      }
      return reply(out);
    }

    if (WRITE_ACTIONS.includes(action)) {
      delete input.token;
      if (action === 'upload' && user) input.akun = input.akun || user.nama;
      const out = stripPasswords(await callGas(input, action === 'upload' ? K.uploadMs : K.timeoutMs, K));
      memory.pull = null;
      memory.pullUntil = 0;
      if (action === 'sync' && out && out.ok) {
        memory.pull = out;
        memory.pullUntil = Date.now() + K.cacheSeconds * 1000;
      }
      return reply(out);
    }

    delete input.token;
    return reply(stripPasswords(await callGas(input, action === 'ambil' ? K.uploadMs : K.timeoutMs, K)));

  } catch (e) {
    console.error('[research-hub] ' + (e && e.message ? e.message : e));
    return reply({ ok: false, error: String(e && e.message ? e.message : e) });
  }
}

/* ── helpers for adapters ── */

/** Read a JSON body from a Node readable stream. Returns {} when empty. */
export async function readJsonBody(stream) {
  if (stream && stream.body && typeof stream.body === 'object' && !Buffer.isBuffer(stream.body)) {
    return stream.body;
  }
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try { return JSON.parse(text); } catch (e) { return {}; }
}

/** Node request/response adapter, used by server.js and api/index.js. */
export async function nodeHandler(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const query = Object.fromEntries(url.searchParams.entries());
  const body = req.method === 'POST' ? await readJsonBody(req) : {};
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const out = await handleRequest({
    method: req.method,
    query,
    body,
    cookie: req.headers.cookie || '',
    secure: proto ? proto === 'https' : (req.socket && req.socket.encrypted === true)
  });
  for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
  res.statusCode = out.status;
  res.end(out.body);
}


/* ── platform entry point ───────────────────────────────────────────────────
   Vercel, and any platform that follows the same Node convention, calls this. */
export default async function handler(req, res) {
  try {
    await nodeHandler(req, res);
  } catch (e) {
    console.error('[research-hub] ' + (e && e.message ? e.message : e));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: false, error: 'Internal error' }));
  }
}
