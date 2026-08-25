/**
 * CESGS Research Hub. A two-way bridge between a Google Spreadsheet and the
 * dashboard, plus email notifications (new task, task comment, weekly reminder).
 *
 * The spreadsheet is the database and the Drive folder holds the attachments.
 * Whatever web host the dashboard itself is deployed to makes no difference to
 * this file: it only ever talks to the dashboard through the /exec address of
 * its own Web App deployment.
 *
 * INSTALL
 * 1. Open the research spreadsheet, then Extensions, then Apps Script.
 * 2. Delete the contents of the default Code.gs, paste this whole file, save.
 * 3. Project Settings, make sure Time zone is (GMT+07:00) Jakarta. The Thursday
 *    10.00 reminder uses this project time zone, not the browser time zone.
 * 4. Pick checkSetup from the function dropdown, click Run, and accept the
 *    permission screens to the end. The permission screen must include Drive
 *    access AND permission to send email. If it does not appear, first revoke
 *    this project at myaccount.google.com/connections, then Run again.
 * 5. Run installEmailTriggers once, to install the five-minute trigger (queue
 *    sender plus the schedule keeper for the weekly reminder).
 * 6. Deploy, Manage deployments, edit the active deployment, Version New
 *    version. The /exec address does not change as long as you edit the
 *    existing deployment rather than creating another one.
 *    If you have never deployed: Deploy, New deployment, type Web app,
 *    Execute as Me, Who has access Anyone, then copy the /exec address.
 * 7. Put that /exec address in the RH_GAS_URL setting of the web deployment.
 *    It must never be written into any file that browsers download.
 *
 * BEHAVIOUR WORTH KNOWING
 * - Helper sheets are MERGED per UID, never overwritten. A device holding a
 *   stale copy can no longer wipe rows created on another device.
 * - Deletion travels between devices through the RH_Hapus sheet (tombstones).
 *   A row deleted on one device is recorded, and other devices then drop it too.
 * - Drive attachments belonging to a deleted row are moved to the trash as
 *   well, through the berkasHapus field the dashboard sends with every 'sync'.
 *   Only files inside DRIVE_FOLDER_ID are touched.
 * - New columns sent by the dashboard are added to the helper sheets
 *   automatically, so adding a field on the HTML side needs no edit here.
 * - Task comments (the RH_Komentar sheet) are stored and returned. An earlier
 *   version dropped the comment payload without any error message.
 *
 * EMAIL NOTIFICATIONS
 * - Events are detected during sync, before the merge: task and comment rows
 *   whose UID is not yet in the sheet count as new.
 * - Email is not sent inside the sync itself. Events are queued in the
 *   RH_Notifikasi sheet and a five-minute trigger sends them. The dashboard
 *   therefore never waits on Gmail, and a failed message can be retried.
 * - The queue key is type plus source plus recipient, so a resend from another
 *   device does not produce a duplicate email.
 * - While the task or comment sheet is still empty, the first sync only fills
 *   the sheet and sends nothing. That guard keeps a fresh install from flooding
 *   everyone's inbox.
 * - Switched on right now: new task, comment on a task, and the weekly progress
 *   reminder. The switches sit together in the email settings block below.
 * - HUB_URL is the address the buttons inside every email point at. Set it to
 *   the address the dashboard is actually served from, otherwise recipients
 *   land on a dead link.
 *
 * CHECKING THAT EMAIL WORKS
 * - emailDiagnostics    reports the switches, the trigger, the schedule, the
 *                       recipients, the queue and the mail quota. Sends nothing.
 * - testReminderToMe    sends one real weekly reminder to whoever runs it.
 * - sendWeeklyReminderNow  runs the weekly reminder for everyone immediately.
 * - sendQueueNow        drains the queue by hand instead of waiting 5 minutes.
 */

/* ─────────────────────────── constants ─────────────────────────── */

// Leave empty (two quote marks) to let the dashboard connect without a token.
var TOKEN      = '';
var SHEET_DATA = 'List (re-arrange)';

var S_LUARAN   = 'RH_Luaran';
var S_PROG     = 'RH_Progres';
var S_REF      = 'RH_Referensi';
var S_TUGAS    = 'RH_Tugas';
var S_TGBERKAS = 'RH_TugasBerkas';
var S_MS       = 'RH_Milestone';
var S_LOG      = 'RH_Logbook';   // no longer synced, the sheet itself is left intact
var S_DOK      = 'RH_Dokumen';
var S_AKUN     = 'RH_Akun';
var S_KOMENTAR = 'RH_Komentar';
var S_KOR      = 'RH_Korespondensi';
var S_HAPUS    = 'RH_Hapus';
var S_NOTIF    = 'RH_Notifikasi';

// Google Drive folder that holds the attachments (the id comes from its URL).
var DRIVE_FOLDER_ID = '1J3ed4gEFXzfpPJzqmr7k-yOSSRlhbGSg';
var MAX_UPLOAD_MB   = 20;

// Attachment sharing rules.
// BERBAGI_SIAPA: 'ANYONE' anyone with the link, 'DOMAIN' only CESGS Workspace
// accounts, 'PRIVATE' not shared at all.
// BERBAGI_IZIN : 'EDIT' may edit, 'VIEW' may only view.
// If the Workspace policy refuses, the script steps down on its own and reports
// what actually applied in the berbagi field of the upload response.
var BERBAGI_SIAPA = 'ANYONE';
var BERBAGI_IZIN  = 'EDIT';

// Include the password column in the response to the 'akun' action. Keep this
// false whenever sign-in goes through the 'login' action, which is the case for
// every current deployment: the server checks the password, so the browser has
// no reason to ever receive that column. Set it to true only if you fall back
// to a build of the dashboard that still matches passwords in the browser.
var AKUN_SERTAKAN_SANDI = false;

/* ── email settings ───────────────────────────────────────────────
 * Every notification switch is in this block. Change them here only.  */

var EMAIL_AKTIF        = true;   // master switch, false silences every email
/* Three notifications are on: a new task, a comment on a task, and the weekly
   progress reminder. The others stay off, because they duplicate what the
   dashboard already shows. Each switch is independent, so turning one on or off
   is a one-line change here, with no need to touch anything else. */
var EMAIL_TUGAS_BARU   = true;   // email when a new task is created
var EMAIL_KOMENTAR     = true;   // email when a task receives a comment
var EMAIL_SEBUT        = false;  // email when an account is tagged with @ in a progress note
var EMAIL_UBAH_STATUS  = false;  // status-change comments are emailed as well; see note below
var EMAIL_PENGINGAT    = true;   // weekly progress reminder
var EMAIL_TENGGAT      = false;  // warning one day before a task deadline

/* Note on EMAIL_UBAH_STATUS. A status change is written as a comment of type
   'status'. With EMAIL_KOMENTAR on and this one off, ordinary comments are
   emailed and pure status changes are not, which is usually what people want.
   Setting it to true makes every status flip produce an email as well. */

var NAMA_PENGIRIM      = 'CESGS Research Hub';
var BALAS_KE           = '';     // fill in when replies should go to a different address
// Public address of the dashboard, used to build the buttons inside emails.
// Change it to whatever address the dashboard is actually served from. It has
// nothing to do with where this script lives, and no trailing page is needed.
var HUB_URL            = 'https://researchhub.cesgs.or.id/';
// Used only when HUB_URL is empty or malformed, so that an email button never
// ends up with an empty link.
var HUB_URL_FALLBACK   = 'https://researchhub.cesgs.or.id/';

// Addresses that always receive a copy, an archive mailbox or a Project Manager.
var TEMBUSAN_TUGAS     = [];
var TEMBUSAN_PENGINGAT = [];

// Reminder schedule. HARI uses JavaScript numbering: 0 Sunday, 1 Monday,
// 2 Tuesday, 4 Thursday, and so on. JAM is on the 24 hour clock.
var PENGINGAT_HARI     = 4;
var PENGINGAT_JAM      = 10;
// An output or a research row counts as needing an update when its last
// progress note is older than this many days.
var PENGINGAT_AMBANG_HARI = 7;
// true: every active account is emailed even when nothing is outstanding.
var PENGINGAT_KIRIM_KOSONG = true;

// Task deadline warning. HARI_SEBELUM 1 means one day ahead, use 2 for two.
// JAM is on the 24 hour clock in the project time zone.
var PERINGATAN_JAM          = 8;
var PERINGATAN_HARI_SEBELUM = 1;
// Include the task author as a recipient. Left off so that a Project Manager
// who creates dozens of tasks does not receive dozens of emails each morning.
var PERINGATAN_KE_PEMBUAT   = false;

// Events older than this many hours are no longer emailed. This keeps a device
// that was offline for a long time from sending stale news when it finally syncs.
var NOTIF_UMUR_JAM     = 72;
// Cap on emails per trigger run. A consumer Gmail account allows 100 per day,
// a Workspace account 1500 per day.
var NOTIF_MAKS_KIRIM   = 40;
// Finished queue rows older than this many days are discarded.
var NOTIF_SIMPAN_HARI  = 45;

var LUARAN_COLS   = ['uid', 'project', 'jenis', 'nama', 'status', 'progres', 'pic', 'tenggat', 'catatan'];
var PROG_COLS     = ['uid', 'target_uid', 'tanggal', 'status', 'persen', 'catatan', 'oleh', 'waktu', 'sebut'];
var REF_COLS      = ['tipe', 'nilai', 'universitas', 'negara', 'lintang', 'bujur'];
var TUGAS_COLS    = ['uid', 'target_uid', 'project', 'judul', 'pic', 'tenggat', 'prioritas', 'status', 'catatan',
                     'lampiran', 'berkas', 'jawaban', 'jawaban_tautan', 'jawaban_berkas',
                     'dikumpulkan_oleh', 'dikumpulkan_tanggal', 'paper', 'dibuat', 'dibuat_oleh'];
var TGBERKAS_COLS = ['uid', 'tugas_uid', 'sisi', 'nama', 'tautan', 'berkas_id', 'ukuran', 'mime', 'oleh', 'tanggal'];
var MS_COLS       = ['uid', 'project', 'nama', 'tanggal', 'jenis', 'status', 'catatan'];
var LOG_COLS      = ['uid', 'peneliti', 'project', 'tanggal', 'jam', 'kegiatan'];
var DOK_COLS      = ['uid', 'project', 'nama', 'kategori', 'pemilik', 'tautan', 'oleh', 'tanggal', 'berkas', 'diubah'];
var AKUN_COLS     = ['uid', 'email', 'nama', 'peran', 'sandi', 'aktif', 'foto'];
var KOMENTAR_COLS = ['uid', 'target_kind', 'target_uid', 'jenis', 'oleh', 'email', 'teks', 'tautan', 'berkas', 'waktu', 'diubah'];
// The correspondence trail of one article with its journal, used for promotion
// files. One row is one piece of evidence.
var KOR_COLS      = ['uid', 'target_uid', 'urut', 'perihal', 'tanggal', 'tautan', 'berkas', 'catatan'];
var HAPUS_COLS    = ['uid', 'lembar', 'tanggal', 'oleh'];
var NOTIF_COLS    = ['uid', 'jenis', 'ref', 'kepada', 'status', 'dibuat', 'dikirim', 'galat'];

// Collection names in the dashboard payload, mapped to sheet and column list.
var KOLEKSI = {
  luaran:      { sheet: S_LUARAN,   cols: LUARAN_COLS },
  progres:     { sheet: S_PROG,     cols: PROG_COLS },
  referensi:   { sheet: S_REF,      cols: REF_COLS },
  tugas:       { sheet: S_TUGAS,    cols: TUGAS_COLS },
  tugasBerkas: { sheet: S_TGBERKAS, cols: TGBERKAS_COLS },
  milestone:   { sheet: S_MS,       cols: MS_COLS },
  /* The weekly logbook was retired in August 2026 because nobody used it. The
     RH_Logbook sheet is deliberately NOT deleted, it merely stops syncing, so
     the old entries stay in the spreadsheet if they are ever needed.
     Switching it back on is a matter of restoring this one line. */
  dokumen:     { sheet: S_DOK,      cols: DOK_COLS },
  akun:        { sheet: S_AKUN,     cols: AKUN_COLS },
  komentar:    { sheet: S_KOMENTAR, cols: KOMENTAR_COLS },
  korespondensi: { sheet: S_KOR,   cols: KOR_COLS }
};

/** Canonical dashboard field names, mapped to the column names that may appear in the research sheet. */
var FIELD_ALIAS = {
  j:   ['judul', 'title'],
  ds:  ['dosen', 'lecturer', 'pengusul'],
  pj:  ['pj', 'pic', 'penanggung jawab'],
  anggota: ['anggota', 'anggota tim', 'co-pj', 'co pj', 'copj'],
  pid: ['id paper', 'paper id', 'kode paper', 'pid'],
  st:  ['status'],
  jn:  ['nama jurnal', 'jurnal', 'journal'],
  ty:  ['type', 'tipe'],
  pr:  ['project', 'skema', 'grant'],
  th:  ['tahun', 'year'],
  tg:  ['target'],
  nm:  ['nominal', 'funding', 'dana'],
  cr:  ['cair', 'disbursement'],
  na:  ['total author', 'jumlah penulis'],
  au:  ['author(s)', 'authors', 'penulis'],
  co:  ['corresponding'],
  dlu: ['d-luaran', 'deadline luaran', 'deadline'],
  dpg: ['d-progres', 'd-progress'],
  nt:  ['notes', 'catatan', 'keterangan'],
  m1p: ['mitra ln 1', 'mitra 1'],
  m1u: ['universitas mitra 1'],
  m1c: ['negara mitra 1'],
  m2p: ['mitra ln 2', 'mitra 2'],
  m2u: ['universitas mitra 2'],
  m2c: ['negara mitra 2']
};

/* ─────────────────────────── entry point ─────────────────────────── */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var aksi = p.action || 'pull';
  if (aksi !== 'ping' && aksi !== 'akun') aksi = 'pull';
  return respond(run(p.token, { action: aksi }));
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
  return respond(run(body.token, body));
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function run(token, body) {
  body = body || {};
  if (TOKEN && String(token || '') !== TOKEN) return { ok: false, error: 'Token tidak cocok' };
  var aksi = String(body.action || 'pull');

  // Light actions run without locking the sheet, so that the sign-in screen and
  // uploads do not queue up behind a sync in progress.
  if (aksi === 'ping' || aksi === 'cek' || aksi === 'login' || aksi === 'akun' ||
      aksi === 'upload' || aksi === 'ambil' || aksi === 'ganti-nama') {
    try {
      if (aksi === 'ping')   return { ok: true, pong: new Date().toISOString() };
      // The cheapest action in this file: one property read, no sheet opened and
      // nothing locked, so it is safe to ask every ten or twenty seconds.
      if (aksi === 'cek')    return { ok: true, rev: revSekarang() };
      if (aksi === 'login')  return cekLogin(body);
      if (aksi === 'akun')   return { ok: true, akun: daftarAkun() };
      if (aksi === 'ambil')  return ambilBerkas(body);
      if (aksi === 'ganti-nama') return gantiNamaBerkas(body);
      return simpanLampiran(body);
    } catch (err) {
      return { ok: false, error: pesanError(err) };
    }
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (err) {
    return { ok: false, error: 'Lembar sedang dipakai proses lain, coba lagi' };
  }
  try {
    setup();
    if (aksi === 'sync') applySync(body);
    var out = pull();
    out.ok = true;
    return out;
  } catch (err2) {
    return { ok: false, error: pesanError(err2) };
  } finally {
    lock.releaseLock();
  }
}

/* ═════════════ revision marker ═════════════
 * Pulling every sheet is expensive: one pull opens eleven helper sheets,
 * completes their UIDs, then reads all of them. So the dashboard does not poll
 * with a full pull. It asks for one cheap revision marker instead, and only
 * pulls in full once that marker has changed. The marker lives in the script
 * properties and is raised by applySync and by the onChange trigger, so edits
 * made straight in the spreadsheet are noticed as well.
 */
var PROP_REV = 'rev_lembar';

function naikkanRev() {
  try {
    PropertiesService.getScriptProperties().setProperty(PROP_REV, String(Date.now()));
  } catch (e) {}
}

function revSekarang() {
  try {
    return PropertiesService.getScriptProperties().getProperty(PROP_REV) || '0';
  } catch (e) {
    return '0';
  }
}

/** Called by the onChange trigger: any spreadsheet change raises the marker. */
function onPerubahanLembar() {
  naikkanRev();
}

function pesanError(err) {
  return String(err && err.message ? err.message : err);
}

/* ─────────────────────────── setup ─────────────────────────── */

function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }

function dataSheet() {
  var sh = ss().getSheetByName(SHEET_DATA);
  if (!sh) throw new Error('Lembar "' + SHEET_DATA + '" tidak ditemukan');
  return sh;
}

/**
 * Fetches a helper sheet, creates it when missing, and adds any standard column
 * that is not there yet without disturbing extra columns added by hand.
 */
function helperSheet(name, cols) {
  var sh = ss().getSheetByName(name);
  if (!sh) {
    sh = ss().insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    return sh;
  }
  var head = bacaHeader(sh);
  var kurang = [];
  for (var i = 0; i < cols.length; i++) {
    if (head.indexOf(cols[i]) < 0 && kurang.indexOf(cols[i]) < 0) kurang.push(cols[i]);
  }
  if (kurang.length) {
    sh.getRange(1, head.length + 1, 1, kurang.length).setValues([kurang]).setFontWeight('bold');
    if (sh.getFrozenRows() < 1) sh.setFrozenRows(1);
  }
  return sh;
}

function bacaHeader(sh) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  while (head.length && !head[head.length - 1]) head.pop();
  return head;
}

/** A helper sheet plus its real column list (standard columns plus extras). */
function headerOf(name, cols) {
  var sh = helperSheet(name, cols);
  return { sh: sh, cols: bacaHeader(sh) };
}

function setup() {
  for (var k in KOLEKSI) helperSheet(KOLEKSI[k].sheet, KOLEKSI[k].cols);
  helperSheet(S_HAPUS, HAPUS_COLS);
  helperSheet(S_NOTIF, NOTIF_COLS);
  ensureUid();
  ensureKolom('Anggota', FIELD_ALIAS.anggota);
  ensureKolom('ID Paper', FIELD_ALIAS.pid);
  lengkapiPid();
  for (var k2 in KOLEKSI) lengkapiUidBantu(KOLEKSI[k2].sheet, KOLEKSI[k2].cols);
}

function uid(prefix) {
  return (prefix || 'r') + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function hariIni() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function waktuKini() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}

/**
 * Adds a column to the research sheet when it is missing. Unlike the helper
 * sheets, upsertRiset only writes columns that actually exist in the sheet, so
 * without this step a new field from the dashboard would vanish silently.
 */
function ensureKolom(nama, aliases) {
  var sh = dataSheet();
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  if (findCol(headers, aliases) >= 0) return false;
  sh.getRange(1, lastCol + 1).setValue(nama).setFontWeight('bold');
  return true;
}

/** Gives a UID to research rows that already have a title but no UID yet. */
function ensureUid() {
  var sh = dataSheet();
  var lastCol = sh.getLastColumn();
  var lastRow = sh.getLastRow();
  if (lastRow < 1) return;
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = -1;
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toLowerCase() === 'uid') { idx = i; break; }
  }
  if (idx < 0) {
    idx = lastCol;
    sh.getRange(1, idx + 1).setValue('UID').setFontWeight('bold');
  }
  if (lastRow < 2) return;
  var col = sh.getRange(2, idx + 1, lastRow - 1, 1);
  var vals = col.getValues();
  var titleIdx = findCol(headers, FIELD_ALIAS.j);
  var titles = titleIdx >= 0 ? sh.getRange(2, titleIdx + 1, lastRow - 1, 1).getValues() : null;
  var dirty = false;
  for (var r = 0; r < vals.length; r++) {
    var isiBaris = titles ? String(titles[r][0]).trim() : 'x';
    if (!String(vals[r][0]).trim() && isiBaris) { vals[r][0] = uid('r'); dirty = true; }
  }
  if (dirty) col.setValues(vals);
}

/**
 * Fills in the paper id for rows that do not have one. The shape is
 * P-<year>-<sequence>, continuing from the highest sequence already used in
 * that year. This runs on the server so that old rows are numbered too and the
 * numbering cannot collide between devices, since only one process may write
 * here at a time.
 */
function lengkapiPid() {
  var sh = dataSheet();
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 2) return;
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var m = colMap(headers);
  if (m.pid == null || m.j == null) return;

  var vals = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var kolom = sh.getRange(2, m.pid + 1, lastRow - 1, 1);
  var isi = kolom.getValues();
  var maks = {};
  for (var a = 0; a < isi.length; a++) {
    var c = String(isi[a][0] || '').trim().match(/^P-(\d{4})-(\d+)$/);
    if (c) maks[c[1]] = Math.max(maks[c[1]] || 0, parseInt(c[2], 10));
  }
  var thnKini = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy');
  var ubah = false;
  for (var r = 0; r < vals.length; r++) {
    if (String(isi[r][0] || '').trim()) continue;
    if (!String(vals[r][m.j] || '').trim()) continue;
    var th = m.th != null ? String(parseInt(vals[r][m.th], 10) || '') : '';
    if (!/^\d{4}$/.test(th)) th = thnKini;
    maks[th] = (maks[th] || 0) + 1;
    var urut = String(maks[th]);
    while (urut.length < 3) urut = '0' + urut;
    isi[r][0] = 'P-' + th + '-' + urut;
    ubah = true;
  }
  if (ubah) kolom.setValues(isi);
}

/** Helper rows typed straight into the spreadsheet are given a UID as well. */
function lengkapiUidBantu(name, cols) {
  if (cols.indexOf('uid') < 0) return;
  var info = headerOf(name, cols);
  var sh = info.sh;
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  var iUid = info.cols.indexOf('uid');
  var vals = sh.getRange(2, 1, lastRow - 1, info.cols.length).getValues();
  var kolomUid = sh.getRange(2, iUid + 1, lastRow - 1, 1);
  var isiUid = kolomUid.getValues();
  var dirty = false;
  for (var r = 0; r < vals.length; r++) {
    if (String(isiUid[r][0]).trim()) continue;
    var adaIsi = false;
    for (var c = 0; c < vals[r].length; c++) {
      if (c !== iUid && String(vals[r][c]).trim()) { adaIsi = true; break; }
    }
    if (adaIsi) { isiUid[r][0] = uid('h'); dirty = true; }
  }
  if (dirty) kolomUid.setValues(isiUid);
}

function findCol(headers, aliases) {
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim().toLowerCase();
    if (!h) continue;
    for (var a = 0; a < aliases.length; a++) {
      if (h === aliases[a] || h.indexOf(aliases[a]) === 0) return i;
    }
  }
  return -1;
}

function colMap(headers) {
  var m = {};
  for (var k in FIELD_ALIAS) {
    var i = findCol(headers, FIELD_ALIAS[k]);
    if (i >= 0) m[k] = i;
  }
  for (var j = 0; j < headers.length; j++) {
    if (String(headers[j]).trim().toLowerCase() === 'uid') m.uid = j;
  }
  return m;
}

/* ─────────────────────────── read ─────────────────────────── */

function teks(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v);
}

function pull() {
  var sh = dataSheet();
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h); });
  var rows = [];
  if (lastRow > 1) {
    var vals = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var m = colMap(headers);
    for (var r = 0; r < vals.length; r++) {
      var judul = m.j != null ? String(vals[r][m.j]).trim() : '';
      if (!judul) continue;
      rows.push(vals[r].map(teks));
    }
  }
  var out = {
    headers: headers,
    rows: rows,
    hapus: readHelper(S_HAPUS, HAPUS_COLS),
    rev: revSekarang(),
    syncedAt: new Date().toISOString()
  };
  for (var k in KOLEKSI) out[k] = readHelper(KOLEKSI[k].sheet, KOLEKSI[k].cols);
  return out;
}

function readHelper(name, baseCols) {
  var info = headerOf(name, baseCols);
  var sh = info.sh, cols = info.cols;
  var lastRow = sh.getLastRow();
  if (lastRow < 2 || !cols.length) return [];
  var vals = sh.getRange(2, 1, lastRow - 1, cols.length).getValues();
  var out = [];
  for (var r = 0; r < vals.length; r++) {
    var o = {}, kosong = true;
    for (var c = 0; c < cols.length; c++) {
      o[cols[c]] = teks(vals[r][c]);
      if (o[cols[c]]) kosong = false;
    }
    if (!kosong) out.push(o);
  }
  return out;
}

function objDari(cols, baris) {
  var o = {};
  for (var c = 0; c < cols.length; c++) o[cols[c]] = teks(baris[c]);
  return o;
}

/** Identity key of a row per sheet. Used for upsert and for deletion. */
function kunci(name, o) {
  if (name === S_REF) {
    var t = String(o.tipe || '').trim().toLowerCase();
    var n = String(o.nilai || '').trim().toLowerCase();
    return (t || n) ? t + '|' + n : '';
  }
  if (name === S_HAPUS) {
    var lb = String(o.lembar || '').trim().toLowerCase();
    var u1 = String(o.uid || '').trim();
    return u1 ? lb + '|' + u1 : '';
  }
  if (name === S_AKUN) {
    var u2 = String(o.uid || '').trim();
    return u2 || String(o.email || '').trim().toLowerCase();
  }
  return String(o.uid || '').trim();
}

/* ─────────────────────────── write ─────────────────────────── */

function applySync(body) {
  var daftarHapus = [];
  var del = body.deleted || [];
  for (var i = 0; i < del.length; i++) daftarHapus.push({ uid: String(del[i] || ''), lembar: 'riset' });
  var hps = body.hapus || [];
  for (var j = 0; j < hps.length; j++) daftarHapus.push(hps[j]);
  if (daftarHapus.length) terapkanHapus(daftarHapus);

  if (body.upsert && body.upsert.length) upsertRiset(body.upsert);

  // Events are counted BEFORE the merge, while the sheet still holds the old
  // state. Once mergeHelper has run, a new row can no longer be told apart.
  var kejadian = [];
  try { kejadian = kumpulkanKejadian(body); } catch (eNotif) { catatGalatNotif(eNotif); }

  for (var k in KOLEKSI) {
    if (body[k]) mergeHelper(KOLEKSI[k].sheet, KOLEKSI[k].cols, body[k]);
  }

  // The queue is written after the merge, so the source row already exists when
  // the sender composes the email. A failure here does not abort the sync.
  try { antreNotifikasi(kejadian); } catch (eAntre) { catatGalatNotif(eAntre); }

  naikkanRev();

  // Attachments of rows that were deleted are moved to the Drive trash. This
  // runs last, so that a Drive failure cannot roll back the row deletions or
  // the sheet writes that already succeeded.
  buangBerkasDrive(body.berkasHapus);
}

/** Update and insert research rows. Columns that were not sent are left alone. */
function upsertRiset(ups) {
  var sh = dataSheet();
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var m = colMap(headers);
  if (m.uid == null) { ensureUid(); return upsertRiset(ups); }

  var pos = petaUidRiset(sh, m.uid);
  for (var i = 0; i < ups.length; i++) {
    var rec = ups[i] || {};
    var id = String(rec.uid || '').trim();
    var rowNum;
    if (id && pos[id]) {
      rowNum = pos[id];
    } else {
      id = id || uid('r');
      rowNum = sh.getLastRow() + 1;
      sh.getRange(rowNum, m.uid + 1).setValue(id);
      pos[id] = rowNum;
    }
    for (var f in rec) {
      if (f === 'uid') continue;
      if (m[f] == null) continue;
      var val = rec[f];
      sh.getRange(rowNum, m[f] + 1).setValue(val === null || val === undefined ? '' : val);
    }
  }
}

function petaUidRiset(sh, iUid) {
  var lastRow = sh.getLastRow();
  var pos = {};
  if (lastRow < 2) return pos;
  var vals = sh.getRange(2, iUid + 1, lastRow - 1, 1).getValues();
  for (var r = 0; r < vals.length; r++) {
    var u = String(vals[r][0]).trim();
    if (u) pos[u] = r + 2;
  }
  return pos;
}

/**
 * Upsert by key. Rows absent from the payload are left in place, so a device
 * holding a stale copy does not delete another device's work.
 */
function mergeHelper(name, baseCols, rows) {
  if (!rows || !rows.length) return;

  var info = headerOf(name, baseCols);
  var sh = info.sh;
  var cols = info.cols;

  // New columns coming from the payload are added to the sheet immediately.
  var extra = [];
  for (var i = 0; i < rows.length; i++) {
    var o0 = rows[i] || {};
    for (var kk in o0) {
      if (cols.indexOf(kk) < 0 && extra.indexOf(kk) < 0) extra.push(kk);
    }
  }
  if (extra.length) {
    sh.getRange(1, cols.length + 1, 1, extra.length).setValues([extra]).setFontWeight('bold');
    cols = cols.concat(extra);
  }

  var lastRow = sh.getLastRow();
  var vals = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, cols.length).getValues() : [];
  var idx = {};
  for (var r = 0; r < vals.length; r++) {
    var k = kunci(name, objDari(cols, vals[r]));
    if (k && idx[k] === undefined) idx[k] = r;
  }

  for (var n = 0; n < rows.length; n++) {
    var o = rows[n] || {};
    var key = kunci(name, o);
    if (!key && cols.indexOf('uid') >= 0) {
      o.uid = uid('h');
      key = kunci(name, o);
    }
    if (key && idx[key] !== undefined) {
      var baris = vals[idx[key]];
      for (var c = 0; c < cols.length; c++) {
        var v = o[cols[c]];
        if (v !== undefined) baris[c] = (v === null ? '' : v);
      }
    } else {
      var baru = cols.map(function (nama) {
        var vv = o[nama];
        return vv === null || vv === undefined ? '' : vv;
      });
      vals.push(baru);
      if (key) idx[key] = vals.length - 1;
    }
  }

  if (vals.length) sh.getRange(2, 1, vals.length, cols.length).setValues(vals);
}

/* ─────────────────────────── deletion across devices ─────────────────────────── */

function lembarDari(nama) {
  var n = String(nama || '').trim();
  if (KOLEKSI[n]) return KOLEKSI[n];
  var alias = { tugas_berkas: 'tugasBerkas', tugasberkas: 'tugasBerkas', dok: 'dokumen', ms: 'milestone' };
  var a = alias[n.toLowerCase()];
  return a ? KOLEKSI[a] : null;
}

function terapkanHapus(list) {
  var sudah = {};
  var tomb = readHelper(S_HAPUS, HAPUS_COLS);
  for (var t = 0; t < tomb.length; t++) sudah[kunci(S_HAPUS, tomb[t])] = true;

  var perLembar = {};
  var catat = [];
  for (var i = 0; i < list.length; i++) {
    var it = list[i];
    if (!it) continue;
    var u = String(typeof it === 'string' ? it : (it.uid || it.key || '')).trim();
    if (!u) continue;
    var lb = String(typeof it === 'string' ? 'riset' : (it.lembar || it.sheet || 'riset')).trim() || 'riset';
    if (!perLembar[lb]) perLembar[lb] = [];
    perLembar[lb].push(u);
    var kt = lb.toLowerCase() + '|' + u;
    if (!sudah[kt]) {
      sudah[kt] = true;
      catat.push({ uid: u, lembar: lb, tanggal: hariIni(), oleh: String((it && it.oleh) || '') });
    }
  }

  for (var nama in perLembar) {
    if (nama === 'riset') hapusBarisRiset(perLembar[nama]);
    else hapusBarisBantu(nama, perLembar[nama]);
  }
  if (catat.length) mergeHelper(S_HAPUS, HAPUS_COLS, catat);
}

function hapusBarisRiset(uids) {
  var sh = dataSheet();
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var m = colMap(headers);
  if (m.uid == null) return;
  var pos = petaUidRiset(sh, m.uid);
  var baris = [];
  for (var i = 0; i < uids.length; i++) {
    if (pos[uids[i]]) baris.push(pos[uids[i]]);
  }
  baris.sort(function (a, b) { return b - a; });
  for (var d = 0; d < baris.length; d++) sh.deleteRow(baris[d]);
}

function hapusBarisBantu(nama, uids) {
  var def = lembarDari(nama);
  if (!def) return;
  var info = headerOf(def.sheet, def.cols);
  var sh = info.sh, cols = info.cols;
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  var vals = sh.getRange(2, 1, lastRow - 1, cols.length).getValues();
  var target = {};
  for (var i = 0; i < uids.length; i++) target[String(uids[i]).toLowerCase()] = true;
  var baris = [];
  for (var r = 0; r < vals.length; r++) {
    var k = String(kunci(def.sheet, objDari(cols, vals[r]))).toLowerCase();
    if (k && target[k]) baris.push(r + 2);
  }
  baris.sort(function (a, b) { return b - a; });
  for (var d = 0; d < baris.length; d++) sh.deleteRow(baris[d]);
}

/* ─────────────────────────── attachments that go with a deletion ───────────────────────────
 * The dashboard sends a berkasHapus field holding the Drive links of deleted
 * documents and tasks. Files are moved to the trash rather than erased, so they
 * can still be recovered from Drive for thirty days.
 *
 * Only files inside DRIVE_FOLDER_ID are touched. A Drive link to anything else,
 * for instance somebody else's document that happened to be pasted into a link
 * column, is deliberately skipped.
 *
 * The operation is idempotent: the dashboard resends the same list until its
 * deletion record expires, and a file already in the trash is skipped.
 */

function buangBerkasDrive(tautanList) {
  if (!tautanList || !tautanList.length) return 0;
  var rata = [];
  for (var q = 0; q < tautanList.length; q++) {
    var pecah = urlSemua(tautanList[q]);
    for (var w = 0; w < pecah.length; w++) rata.push(pecah[w]);
  }
  tautanList = rata;
  if (!DRIVE_FOLDER_ID) return 0;

  var folder;
  try { folder = DriveApp.getFolderById(DRIVE_FOLDER_ID); }
  catch (e) { return 0; }

  var n = 0;
  for (var i = 0; i < tautanList.length; i++) {
    var id = idBerkasDari(String(tautanList[i] || ''));
    if (!id) continue;
    try {
      var file = DriveApp.getFileById(id);
      if (file.isTrashed()) continue;
      if (!didalamFolder(file, folder)) continue;
      file.setTrashed(true);
      n++;
    } catch (e2) {
      // file already gone, not owned by this account, or an invalid id: skip
    }
  }
  return n;
}

function idBerkasDari(u) {
  var m = u.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  m = u.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return '';
}

/**
 * Since attachments are filed into subfolders per context and per project, the
 * direct parent of a file is no longer the root folder. The check therefore
 * walks the parent chain up several levels; without this, attachment cleanup
 * stops working with no error message at all.
 */
function didalamFolder(file, folder) {
  var idTarget = folder.getId();
  var lapis = [file], tingkat = 0;
  while (lapis.length && tingkat <= FOLDER_MAKS_DALAM) {
    var berikut = [];
    for (var i = 0; i < lapis.length; i++) {
      var induk = lapis[i].getParents();
      while (induk.hasNext()) {
        var f = induk.next();
        if (f.getId() === idTarget) return true;
        berikut.push(f);
      }
    }
    lapis = berikut;
    tingkat++;
  }
  return false;
}

/* ─────────────────────────── accounts and sign-in ─────────────────────────── */

function aktifKah(v) {
  var s = String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  if (!s) return true;
  return ['false', '0', 'tidak', 'no', 'nonaktif', 'off'].indexOf(s) < 0;
}

function daftarAkun() {
  var akun = readHelper(S_AKUN, AKUN_COLS);
  if (AKUN_SERTAKAN_SANDI) return akun;
  return akun.map(function (a) {
    var o = {};
    for (var k in a) if (k !== 'sandi') o[k] = a[k];
    return o;
  });
}

function cekLogin(b) {
  var email = String(b.email || b.mail || '').trim().toLowerCase();
  var sandi = String(b.sandi || b.pass || '');
  if (!email) return { ok: false, error: 'Surel kosong' };
  var akun = readHelper(S_AKUN, AKUN_COLS);
  for (var i = 0; i < akun.length; i++) {
    if (String(akun[i].email || '').trim().toLowerCase() !== email) continue;
    if (!aktifKah(akun[i].aktif)) return { ok: false, error: 'Akun dinonaktifkan' };
    if (String(akun[i].sandi || '') !== sandi) return { ok: false, error: 'Sandi tidak cocok' };
    var o = {};
    for (var k in akun[i]) if (k !== 'sandi') o[k] = akun[i][k];
    return { ok: true, akun: o };
  }
  return { ok: false, error: 'Akun tidak terdaftar' };
}

/* ─────────────────────────── attachments ─────────────────────────── */

/* Folder name per upload context. The key is sent by the dashboard in the
   konteks field; anything unrecognised falls to Lainnya, never to the root. */
var FOLDER_KONTEKS = {
  tugas:    'Tugas',
  jawaban:  'Tugas - Pengumpulan',
  komentar: 'Komentar',
  dokumen:  'Dokumen',
  foto:     'Foto Profil',
  korespondensi: 'Bukti Korespondensi',
  riset:    'Riset',
  milestone:'Milestone',
  lainnya:  'Lainnya'
};
var FOLDER_MAKS_DALAM = 4;   // how far up the parent chain the ownership check walks

function bersihNamaFolder(v) {
  return String(v || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90);
}

/**
 * The subfolder of one paper, recognised by its UID prefix rather than by its
 * title. Article titles change many times on the way to publication, and if the
 * folder were looked up by title one paper would end up with two folders
 * without anyone noticing. With a UID prefix the old folder is always found,
 * and its name is then brought in line with the current title.
 *
 * An older folder that was named with a bare title and no prefix is adopted
 * once, so that files uploaded before this rule came in are not left behind in
 * an orphaned folder.
 */
function subFolderPaper(induk, id, judul) {
  var kode = bersihNamaFolder(id);
  var bersihJudul = bersihNamaFolder(judul);
  if (!kode) return subFolder(induk, bersihJudul || 'Tanpa Judul');

  var it = induk.getFolders(), f, nama;
  while (it.hasNext()) {
    f = it.next();
    nama = f.getName();
    if (nama === kode) { catatJudulFolder(f, judul); return f; }
    // folder from the previous rule, named code followed by title
    if (nama.indexOf(kode + ' - ') === 0) {
      try { f.setName(kode); } catch (e) {}
      catatJudulFolder(f, judul);
      return f;
    }
    // old folder named with a bare title, adopted and then renamed to the code
    if (bersihJudul && nama === bersihJudul) {
      try { f.setName(kode); } catch (e2) {}
      catatJudulFolder(f, judul);
      return f;
    }
  }
  f = induk.createFolder(kode);
  catatJudulFolder(f, judul);
  return f;
}

/**
 * The folder name deliberately holds only the code, so that it stays short and
 * does not change when the title is revised. The title goes in the folder
 * description, which shows in the Drive details panel and is indexed by Drive
 * search, so the folder can still be found by title.
 */
function catatJudulFolder(folder, judul) {
  var j = String(judul || '').trim();
  if (!j) return;
  try {
    if (folder.getDescription() !== j) folder.setDescription(j);
  } catch (e) {}
}

/** Fetches a subfolder with the given name, creating it when missing. */
function subFolder(induk, nama) {
  var bersih = bersihNamaFolder(nama);
  if (!bersih) return induk;
  var it = induk.getFoldersByName(bersih);
  return it.hasNext() ? it.next() : induk.createFolder(bersih);
}

/**
 * The destination folder of one upload, in two layers.
 *
 * The first layer answers "whose file is this". When the upload site names a
 * paper title, that title is used. If not, the name of the account uploading.
 * When both are empty it falls back to Umum, so a file is never left loose in
 * the root.
 *
 * The second layer answers "what kind of file". Documents use their category,
 * such as CV, Proposal or Laporan. Everything else uses the name of the upload
 * site, such as Tugas, Komentar or Bukti Korespondensi.
 *
 * The older arrangement that used project names is not removed. Files already
 * sitting there stay readable and can still be cleaned up, because the
 * ownership check walks up to four levels of parents.
 */
function folderUnggah(konteks, paper, akun, kategori, paperId) {
  var akar = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  var k = String(konteks || '').trim().toLowerCase();
  var lapis2 = bersihNamaFolder(kategori) || FOLDER_KONTEKS[k] || FOLDER_KONTEKS.lainnya;
  var lapis1;
  /* Branch order, most decisive first.
     1. Anything tied to a paper, whatever kind of file it is, goes to Riset.
     2. Anything with a document category, CV or Laporan for instance, goes to
        Umum, so that files of one kind gather in one place regardless of who
        uploaded them.
     3. The rest, meaning profile photos and task or comment attachments that
        are not tied to a paper, go to Orang under the uploading account.
     The root holds only those three branches, never a loose file. */
  if (paper || paperId) lapis1 = subFolderPaper(subFolder(akar, 'Riset'), paperId, paper);
  else if (kategori) lapis1 = subFolder(akar, 'Umum');
  else if (akun) lapis1 = subFolder(subFolder(akar, 'Orang'), bersihNamaFolder(akun));
  else lapis1 = subFolder(akar, 'Umum');
  return subFolder(lapis1, lapis2);
}

/**
 * File names get a sequence number and a date as a prefix, so that the contents
 * of a folder are readable and ordered without opening the application. The
 * sequence number is only used where the upload site has an order of its own,
 * correspondence evidence for example.
 */
function namaBerkas(asli, urut, tanggal) {
  var nama = String(asli || 'lampiran').trim();
  var awalan = [];
  var no = parseInt(urut, 10);
  if (isFinite(no) && no > 0) awalan.push(no < 10 ? '0' + no : String(no));
  var t = tglISO(tanggal);
  if (t) awalan.push(t);
  if (!awalan.length) return nama;
  // an existing prefix is not stacked a second time
  if (nama.indexOf(awalan.join(' - ') + ' - ') === 0) return nama;
  return awalan.join(' - ') + ' - ' + nama;
}

function simpanLampiran(b) {
  if (!DRIVE_FOLDER_ID) return { ok: false, error: 'DRIVE_FOLDER_ID belum diisi di Code.gs' };
  var data = String(b.data || '');
  if (!data) return { ok: false, error: 'Berkas kosong' };
  var perkiraanByte = Math.floor(data.length * 3 / 4);
  if (perkiraanByte > MAX_UPLOAD_MB * 1024 * 1024) {
    return { ok: false, error: 'Berkas melebihi ' + MAX_UPLOAD_MB + ' MB' };
  }
  var folder = folderUnggah(b.konteks, b.paper, b.akun, b.kategori, b.paperId);
  var nama = namaBerkas(b.nama || 'lampiran', b.urut, b.tanggal);
  var blob = Utilities.newBlob(Utilities.base64Decode(data), b.mime || 'application/octet-stream', nama);
  var file = folder.createFile(blob);
  var berbagi = aturBerbagi(file);
  return {
    ok: true,
    berbagi: berbagi,
    folder: folder.getName(),
    file: {
      id: file.getId(),
      nama: file.getName(),
      ukuran: file.getSize(),
      berbagi: berbagi,
      folder: folder.getName(),
      url: 'https://drive.google.com/file/d/' + file.getId() + '/view',
      gambar: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w600'
    }
  };
}

/**
 * Returns the contents of one Drive file as base64. The dashboard uses this to
 * merge evidence files into a single PDF in the browser: a Drive link does not
 * allow cross-origin fetching, so this server bridges the gap. Only files
 * inside the Research Hub attachment folder are served, and there is a size
 * limit so the response cannot balloon.
 */
var AMBIL_MAKS_MB = 12;

function ambilBerkas(b) {
  var id = idBerkasDari(String(b.url || '')) || String(b.id || '').trim();
  if (!id) return { ok: false, error: 'Tautan berkas tidak dikenali' };
  if (!DRIVE_FOLDER_ID) return { ok: false, error: 'DRIVE_FOLDER_ID belum diisi' };

  var file;
  try { file = DriveApp.getFileById(id); }
  catch (e) { return { ok: false, error: 'Berkas tidak ditemukan atau tidak dapat diakses' }; }

  var akar;
  try { akar = DriveApp.getFolderById(DRIVE_FOLDER_ID); }
  catch (e2) { return { ok: false, error: 'Folder lampiran tidak terbaca' }; }
  if (!didalamFolder(file, akar)) {
    return { ok: false, error: 'Berkas berada di luar folder lampiran Research Hub' };
  }
  if (file.getSize() > AMBIL_MAKS_MB * 1024 * 1024) {
    return { ok: false, error: 'Berkas ' + file.getName() + ' melebihi ' + AMBIL_MAKS_MB + ' MB' };
  }
  var blob = file.getBlob();
  return {
    ok: true,
    nama: file.getName(),
    mime: blob.getContentType(),
    ukuran: file.getSize(),
    data: Utilities.base64Encode(blob.getBytes())
  };
}

/**
 * Renames a set of Drive files. The dashboard uses this to tidy up the sequence
 * prefixes after evidence has been reordered. Only files inside the Research
 * Hub attachment folder are touched.
 */
function gantiNamaBerkas(b) {
  var daftar = b.berkas || [];
  if (!daftar.length) return { ok: true, diubah: 0 };
  var akar;
  try { akar = DriveApp.getFolderById(DRIVE_FOLDER_ID); }
  catch (e) { return { ok: false, error: 'Folder lampiran tidak terbaca' }; }

  var n = 0, gagal = 0;
  for (var i = 0; i < daftar.length; i++) {
    var it = daftar[i] || {};
    var id = idBerkasDari(String(it.url || ''));
    var nama = String(it.nama || '').trim();
    if (!id || !nama) { gagal++; continue; }
    try {
      var f = DriveApp.getFileById(id);
      if (!didalamFolder(f, akar)) { gagal++; continue; }
      if (f.getName() !== nama) { f.setName(nama); n++; }
    } catch (e2) { gagal++; }
  }
  return { ok: true, diubah: n, gagal: gagal };
}

/**
 * Applies the sharing rule, stepping down when the Workspace policy refuses.
 * Returns a label for the rule that ended up in force.
 */
function aturBerbagi(file) {
  if (BERBAGI_SIAPA === 'PRIVATE') return 'PRIVATE';
  var izin = (BERBAGI_IZIN === 'EDIT') ? DriveApp.Permission.EDIT : DriveApp.Permission.VIEW;
  var coba = [];
  if (BERBAGI_SIAPA === 'ANYONE') {
    coba.push({ akses: DriveApp.Access.ANYONE_WITH_LINK, izin: izin, label: 'ANYONE/' + BERBAGI_IZIN });
    coba.push({ akses: DriveApp.Access.DOMAIN_WITH_LINK, izin: izin, label: 'DOMAIN/' + BERBAGI_IZIN });
    coba.push({ akses: DriveApp.Access.DOMAIN_WITH_LINK, izin: DriveApp.Permission.VIEW, label: 'DOMAIN/VIEW' });
    coba.push({ akses: DriveApp.Access.ANYONE_WITH_LINK, izin: DriveApp.Permission.VIEW, label: 'ANYONE/VIEW' });
  } else {
    coba.push({ akses: DriveApp.Access.DOMAIN_WITH_LINK, izin: izin, label: 'DOMAIN/' + BERBAGI_IZIN });
    coba.push({ akses: DriveApp.Access.DOMAIN_WITH_LINK, izin: DriveApp.Permission.VIEW, label: 'DOMAIN/VIEW' });
  }
  for (var i = 0; i < coba.length; i++) {
    try {
      file.setSharing(coba[i].akses, coba[i].izin);
      return coba[i].label;
    } catch (e) {}
  }
  return 'PRIVATE (kebijakan Workspace menolak berbagi)';
}

/* ═════════════════════════════════════════════════════════════════
 * EMAIL NOTIFICATIONS
 * Three things trigger a message: a new task, a task comment, and the weekly
 * reminder. The flow is always the same: the event is detected during sync,
 * queued in RH_Notifikasi, and a time trigger does the actual sending.
 * ════════════════════════════════════════════════════════════════ */

var _CACHE = {};

function bersihkanCache() { _CACHE = {}; }

function tabel(name, cols) {
  if (!_CACHE[name]) _CACHE[name] = readHelper(name, cols);
  return _CACHE[name];
}

function cariBaris(name, cols, id) {
  var t = tabel(name, cols);
  var cari = String(id || '').trim();
  if (!cari) return null;
  for (var i = 0; i < t.length; i++) {
    if (String(t[i].uid || '').trim() === cari) return t[i];
  }
  return null;
}

function catatGalatNotif(err) {
  try { Logger.log('Notifikasi gagal: ' + pesanError(err)); } catch (e) {}
}

/* ── time ── */

var HARI_ID  = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
var BULAN_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

function parseWaktu(s) {
  if (s instanceof Date) return s;
  var t = String(s || '').trim();
  if (!t) return null;
  var m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  var m2 = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m2) return new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]), Number(m2[4]), Number(m2[5]));
  var d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

function tglPendek(s) {
  var d = parseWaktu(s);
  if (!d) return String(s || '');
  return d.getDate() + ' ' + BULAN_ID[d.getMonth()] + ' ' + d.getFullYear();
}

function waktuPanjang(s) {
  var d = parseWaktu(s);
  if (!d) return String(s || '');
  var jam = ('0' + d.getHours()).slice(-2) + '.' + ('0' + d.getMinutes()).slice(-2);
  return HARI_ID[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN_ID[d.getMonth()] + ' ' + d.getFullYear() + ' pukul ' + jam;
}

function selisihHari(s) {
  var d = parseWaktu(s);
  if (!d) return null;
  var kini = new Date();
  var a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var b = new Date(kini.getFullYear(), kini.getMonth(), kini.getDate());
  return Math.round((b - a) / 86400000);
}

function kedaluwarsa(s) {
  var d = parseWaktu(s);
  if (!d) return false;
  return (new Date() - d) > NOTIF_UMUR_JAM * 3600000;
}

function labelTenggat(s) {
  var n = selisihHari(s);
  if (n === null) return String(s || 'tanpa tenggat');
  if (n > 0)  return tglPendek(s) + ' (telat ' + n + ' hari)';
  if (n === 0) return tglPendek(s) + ' (hari ini)';
  return tglPendek(s) + ' (' + (-n) + ' hari lagi)';
}

/* ── matching names to accounts ── */

var GELAR = ('prof dr drs dra ir hj kh drg apt ns amd ' +
  'sa sab se sh si ssi ss ssos sos sp spd skom sak sei sfarm skm sked spsi ste sstp spt spi ' +
  'sm sikom sip str stp sgz skep spar sars sstat sds ssn smb sst st sma sag shut ' +
  'm mm msi msc mba mt ma mhum mkom mpd mfin mec msa mak mph mpa msm mmt mkes mpsi mres mphil ' +
  'me mp macc meng mstat mfarm mikom mkn mh mag mtr mds mab ' +
  'phd dphil edd dba llm llb bsc bba ' +
  'ak ca cpa cma cfa qia cfp cfe frm cgma acpa ipm ipu cpma cpsak bkp cra cwm cae cfra').split(' ');

var GELAR_AMBIGU = ['ma', 'sa', 'si', 'ss', 'ho', 'yu', 'li', 'ng', 'na'];

/**
 * Strips academic titles from a name. A one or two letter abbreviation is only
 * dropped when it is written with dots or in full capitals, so that a genuine
 * short name is not lost. The rule matches the one used by the dashboard.
 */
function namaKunci(s) {
  var asli = String(s || '').split(/[\s,]+/).filter(function (w) { return w.length; });
  var kata = [];
  for (var i = 0; i < asli.length; i++) {
    var raw = asli[i];
    var k = raw.toLowerCase().replace(/[^a-z]/g, '');
    if (!k || k.length < 2 && !/\./.test(raw)) continue;
    if (GELAR.indexOf(k) >= 0) {
      // A two letter abbreviation that is also a common personal name must carry
      // dots or full capitals; other abbreviations are dropped however written.
      if (k.length > 1 && GELAR_AMBIGU.indexOf(k) < 0) continue;
      if (/\./.test(raw) || raw === raw.toUpperCase()) continue;
    }
    if (k.length > 1) kata.push(k);
  }
  return kata.join(' ');
}

/** A match when every word of the shorter name appears in the longer one. */
function namaCocok(a, b) {
  var x = namaKunci(a), y = namaKunci(b);
  if (!x || !y) return false;
  if (x === y) return true;
  var ax = x.split(' '), ay = y.split(' ');
  var kecil = ax.length <= ay.length ? ax : ay;
  var besar = ax.length <= ay.length ? ay : ax;
  for (var i = 0; i < kecil.length; i++) {
    if (besar.indexOf(kecil[i]) < 0) return false;
  }
  return true;
}

function akunPeta() {
  if (_CACHE.__akun) return _CACHE.__akun;
  var akun = readHelper(S_AKUN, AKUN_COLS);
  var peta = { byMail: {}, byNama: {}, aktif: [] };
  for (var i = 0; i < akun.length; i++) {
    var a = akun[i];
    var mail = String(a.email || '').trim().toLowerCase();
    if (!mail || mail.indexOf('@') < 1) continue;
    peta.byMail[mail] = a;
    var nk = namaKunci(a.nama);
    if (nk && !peta.byNama[nk]) peta.byNama[nk] = a;
    if (aktifKah(a.aktif)) peta.aktif.push(a);
  }
  _CACHE.__akun = peta;
  return peta;
}

/** The value may be an email address directly, or a person's name in RH_Akun. */
function surelUntuk(nilai, peta) {
  var s = String(nilai || '').trim();
  if (!s) return '';
  if (s.indexOf('@') > 0) return s.toLowerCase();
  peta = peta || akunPeta();
  var nk = namaKunci(s);
  if (!nk) return '';
  if (peta.byNama[nk]) return String(peta.byNama[nk].email || '').trim().toLowerCase();
  for (var k in peta.byNama) {
    if (namaCocok(k, nk)) return String(peta.byNama[k].email || '').trim().toLowerCase();
  }
  return '';
}

/**
 * The pic column in RH_Tugas may hold several names at once, separated by
 * semicolons. Commas are deliberately not used, because academic titles
 * already contain them.
 */
function pisahOrang(v) {
  return String(v === null || v === undefined ? '' : v).split(';')
    .map(function (x) { return x.trim(); })
    .filter(function (x) { return x.length > 0; });
}

/** Every email address from one person-in-charge column, already de-duplicated. */
function surelSemua(nilai, peta) {
  var out = [], daftar = pisahOrang(nilai);
  for (var i = 0; i < daftar.length; i++) tambahSurel(out, surelUntuk(daftar[i], peta));
  return out;
}

/** Names in the person-in-charge column that have no match in RH_Akun. */
function orangTanpaAkun(nilai, peta) {
  var out = [], daftar = pisahOrang(nilai);
  for (var i = 0; i < daftar.length; i++) {
    if (!surelUntuk(daftar[i], peta)) out.push(daftar[i]);
  }
  return out;
}

function tambahSurel(arr, mail) {
  var m = String(mail || '').trim().toLowerCase();
  if (!m || m.indexOf('@') < 1) return;
  if (arr.indexOf(m) < 0) arr.push(m);
}

function buangSurel(arr, mail) {
  var m = String(mail || '').trim().toLowerCase();
  if (!m) return;
  var i = arr.indexOf(m);
  if (i >= 0) arr.splice(i, 1);
}

/* ── event detection, runs before the merge ── */

function kumpulkanKejadian(body) {
  if (!EMAIL_AKTIF) return [];
  bersihkanCache();
  var ev = [];
  var peta = akunPeta();

  var tugasLama = tabel(S_TUGAS, TUGAS_COLS);
  var adaTugas = {};
  for (var i = 0; i < tugasLama.length; i++) adaTugas[String(tugasLama[i].uid || '').trim()] = tugasLama[i];

  // An empty sheet means a fresh install. Fill the sheet, send nothing.
  if (EMAIL_TUGAS_BARU && tugasLama.length && body.tugas && body.tugas.length) {
    for (var t = 0; t < body.tugas.length; t++) {
      var tg = body.tugas[t] || {};
      var uidT = String(tg.uid || '').trim();
      if (!uidT || adaTugas[uidT]) continue;
      if (!String(tg.judul || '').trim()) continue;
      if (kedaluwarsa(tg.dibuat)) continue;
      var kirimT = [];
      var picT = surelSemua(tg.pic, peta);
      for (var pt = 0; pt < picT.length; pt++) tambahSurel(kirimT, picT[pt]);
      for (var c1 = 0; c1 < TEMBUSAN_TUGAS.length; c1++) tambahSurel(kirimT, TEMBUSAN_TUGAS[c1]);
      buangSurel(kirimT, surelUntuk(tg.dibuat_oleh, peta));
      ev.push({ jenis: 'tugas_baru', ref: uidT, kepada: kirimT });
      // A PIC whose name is not in RH_Akun is recorded, so it is not lost silently
      var belumT = orangTanpaAkun(tg.pic, peta);
      if (belumT.length) {
        ev.push({ jenis: 'tugas_baru', ref: uidT + '|tanpa-akun', kepada: [],
                  nota: 'PIC tanpa akun bersurel, ' + belumT.join(', ') });
      }
      adaTugas[uidT] = tg;   // comments on the same task stay resolvable
    }
  }

  var komLama = tabel(S_KOMENTAR, KOMENTAR_COLS);
  if (EMAIL_KOMENTAR && komLama.length && body.komentar && body.komentar.length) {
    var adaKom = {};
    for (var j = 0; j < komLama.length; j++) adaKom[String(komLama[j].uid || '').trim()] = true;

    for (var n = 0; n < body.komentar.length; n++) {
      var km = body.komentar[n] || {};
      var uidK = String(km.uid || '').trim();
      if (!uidK || adaKom[uidK]) continue;
      if (String(km.target_kind || 'tugas') !== 'tugas') continue;
      if (String(km.jenis || '') === 'status' && !EMAIL_UBAH_STATUS) continue;
      if (!String(km.teks || '').trim() && !String(km.tautan || '').trim()) continue;
      if (kedaluwarsa(km.waktu)) continue;

      var tugas = adaTugas[String(km.target_uid || '').trim()];
      if (!tugas) continue;

      var kirimK = [];
      var picK = surelSemua(tugas.pic, peta);
      for (var pk = 0; pk < picK.length; pk++) tambahSurel(kirimK, picK[pk]);
      tambahSurel(kirimK, surelUntuk(tugas.dibuat_oleh, peta));
      // earlier responders on the same task are notified as well
      for (var p = 0; p < komLama.length; p++) {
        if (String(komLama[p].target_uid || '') !== String(km.target_uid || '')) continue;
        tambahSurel(kirimK, surelUntuk(komLama[p].email || komLama[p].oleh, peta));
      }
      for (var c2 = 0; c2 < TEMBUSAN_TUGAS.length; c2++) tambahSurel(kirimK, TEMBUSAN_TUGAS[c2]);
      buangSurel(kirimK, surelUntuk(km.email || km.oleh, peta));

      ev.push({ jenis: 'komentar_baru', ref: uidK, kepada: kirimK });
      adaKom[uidK] = true;
    }
  }
  var progLama = tabel(S_PROG, PROG_COLS);
  if (EMAIL_SEBUT && progLama.length && body.progres && body.progres.length) {
    var adaProg = {};
    for (var q = 0; q < progLama.length; q++) adaProg[String(progLama[q].uid || '').trim()] = true;

    for (var w = 0; w < body.progres.length; w++) {
      var pg = body.progres[w] || {};
      var uidP = String(pg.uid || '').trim();
      if (!uidP || adaProg[uidP]) continue;
      adaProg[uidP] = true;
      if (!String(pg.sebut || '').trim()) continue;
      if (kedaluwarsa(pg.waktu || pg.tanggal)) continue;

      var kirimS = surelSemua(pg.sebut, peta);
      buangSurel(kirimS, surelUntuk(pg.oleh, peta));
      if (!kirimS.length) continue;
      ev.push({ jenis: 'sebut_progres', ref: uidP, kepada: kirimS });
    }
  }

  return ev;
}

/* ── the queue ── */

function antreNotifikasi(ev) {
  if (!ev || !ev.length) return 0;
  var lama = readHelper(S_NOTIF, NOTIF_COLS);
  var ada = {};
  for (var i = 0; i < lama.length; i++) {
    ada[String(lama[i].jenis || '') + '|' + String(lama[i].ref || '') + '|' + String(lama[i].kepada || '')] = true;
  }
  var baru = [];
  for (var e = 0; e < ev.length; e++) {
    var it = ev[e];
    var to = it.kepada || [];
    if (!to.length) {
      var kk = it.jenis + '|' + it.ref + '|';
      if (ada[kk]) continue;
      ada[kk] = true;
      baru.push({ uid: uid('n'), jenis: it.jenis, ref: it.ref, kepada: '', status: 'lewat',
                  dibuat: waktuKini(), dikirim: '', galat: it.nota || 'tidak ada penerima bersurel' });
      continue;
    }
    for (var r = 0; r < to.length; r++) {
      var k2 = it.jenis + '|' + it.ref + '|' + to[r];
      if (ada[k2]) continue;
      ada[k2] = true;
      baru.push({ uid: uid('n'), jenis: it.jenis, ref: it.ref, kepada: to[r], status: 'antre',
                  dibuat: waktuKini(), dikirim: '', galat: '' });
    }
  }
  if (baru.length) mergeHelper(S_NOTIF, NOTIF_COLS, baru);
  return baru.length;
}

/* ── the sender, called by the time trigger ── */

function kirimAntrean() {
  if (!EMAIL_AKTIF) return 'surel dimatikan';
  var prop = PropertiesService.getScriptProperties();
  var sibukSampai = Number(prop.getProperty('kirim_sibuk') || 0);
  if (sibukSampai > Date.now()) return 'pengirim lain sedang jalan';
  prop.setProperty('kirim_sibuk', String(Date.now() + 4 * 60000));

  try {
    bersihkanCache();
    var info = headerOf(S_NOTIF, NOTIF_COLS);
    var sh = info.sh, cols = info.cols;
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return 'antrean kosong';

    var iStatus = cols.indexOf('status');
    var iKirim  = cols.indexOf('dikirim');
    var iGalat  = cols.indexOf('galat');
    var vals = sh.getRange(2, 1, lastRow - 1, cols.length).getValues();
    var sisaKuota = MailApp.getRemainingDailyQuota();
    var terkirim = 0, gagal = 0;

    for (var r = 0; r < vals.length && terkirim < NOTIF_MAKS_KIRIM; r++) {
      var o = objDari(cols, vals[r]);
      if (String(o.status || '').trim() !== 'antre') continue;

      if (sisaKuota <= 1) {
        tulisStatus(sh, r + 2, iStatus, iGalat, iKirim, 'tunda', 'kuota surel harian habis', '');
        continue;
      }
      var isi = null;
      try { isi = susunSurel(o.jenis, o.ref, o.kepada); }
      catch (eSusun) {
        tulisStatus(sh, r + 2, iStatus, iGalat, iKirim, 'gagal', pesanError(eSusun), '');
        gagal++;
        continue;
      }
      if (!isi) {
        tulisStatus(sh, r + 2, iStatus, iGalat, iKirim, 'lewat', 'sumber tidak ditemukan lagi', '');
        continue;
      }
      try {
        var opsi = { to: o.kepada, subject: isi.subjek, htmlBody: isi.html, body: isi.teks, name: NAMA_PENGIRIM };
        if (BALAS_KE) opsi.replyTo = BALAS_KE;
        MailApp.sendEmail(opsi);
        tulisStatus(sh, r + 2, iStatus, iGalat, iKirim, 'terkirim', '', waktuKini());
        sisaKuota--; terkirim++;
      } catch (eKirim) {
        tulisStatus(sh, r + 2, iStatus, iGalat, iKirim, 'gagal', pesanError(eKirim), '');
        gagal++;
      }
    }
    rapikanAntrean(sh, cols);
    return terkirim + ' terkirim, ' + gagal + ' gagal, sisa kuota ' + sisaKuota;
  } finally {
    prop.deleteProperty('kirim_sibuk');
  }
}

function tulisStatus(sh, baris, iStatus, iGalat, iKirim, status, galat, kirim) {
  sh.getRange(baris, iStatus + 1).setValue(status);
  if (iGalat >= 0) sh.getRange(baris, iGalat + 1).setValue(galat || '');
  if (iKirim >= 0 && kirim) sh.getRange(baris, iKirim + 1).setValue(kirim);
}

/** Drops old finished queue rows so the sheet does not keep growing. */
function rapikanAntrean(sh, cols) {
  var lastRow = sh.getLastRow();
  if (lastRow < 400) return;
  var vals = sh.getRange(2, 1, lastRow - 1, cols.length).getValues();
  var buang = [];
  for (var r = 0; r < vals.length; r++) {
    var o = objDari(cols, vals[r]);
    var st = String(o.status || '');
    if (st !== 'terkirim' && st !== 'lewat') continue;
    var umur = selisihHari(o.dikirim || o.dibuat);
    if (umur !== null && umur > NOTIF_SIMPAN_HARI) buang.push(r + 2);
  }
  buang.sort(function (a, b) { return b - a; });
  for (var d = 0; d < buang.length; d++) sh.deleteRow(buang[d]);
}

function susunSurel(jenis, ref, kepada) {
  if (jenis === 'tugas_baru') {
    var t = cariBaris(S_TUGAS, TUGAS_COLS, ref);
    return t ? emailTugasBaru(t, kepada) : null;
  }
  if (jenis === 'komentar_baru') {
    var k = cariBaris(S_KOMENTAR, KOMENTAR_COLS, ref);
    if (!k) return null;
    var tg = cariBaris(S_TUGAS, TUGAS_COLS, k.target_uid);
    return emailKomentar(k, tg);
  }
  if (jenis === 'tenggat_tugas') {
    var bagian = String(ref || '').split('|');
    var tg = cariBaris(S_TUGAS, TUGAS_COLS, bagian[0]);
    if (!tg) return null;
    // A task finished in the meantime, or with a moved deadline, is not sent.
    if (/selesai/i.test(String(tg.status || ''))) return null;
    if (bagian[1] && tglISO(tg.tenggat) !== bagian[1]) return null;
    return emailTenggat(tg);
  }
  if (jenis === 'sebut_progres') {
    var pg = cariBaris(S_PROG, PROG_COLS, ref);
    return pg ? emailSebut(pg) : null;
  }
  if (jenis === 'pengingat') {
    return emailPengingat(String(ref || '').split('|')[0] || kepada);
  }
  return null;
}

/* ═════════════ HTML email frame ═════════════
 * Every style is written inline. Gmail, Outlook and Apple Mail throw away
 * <style> blocks, grid and flexbox, so the layout is built with tables.
 * The colours come from the dashboard tokens: navy #08192E through #2E85CE,
 * action blue #1A6DC9, purple #7A5AF8, ink #101828, rules #E7EAF1.
 */

var E_FONT  = 'font-family:Inter,Helvetica,Arial,sans-serif';
var E_INK   = '#101828';
var E_INK2  = '#475069';
var E_INK3  = '#98A1B3';
var E_LINE  = '#E7EAF1';
var E_BIRU  = '#1A6DC9';

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function brk(s) { return esc(s).replace(/\r?\n/g, '<br>'); }

function urlAman(u) {
  // An attachment field may hold several addresses, separated by newlines. For
  // an email the first address is enough to use as the link.
  var s = String(u || '').split(/\r?\n/)[0].trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

/** Every address in one attachment field. */
function urlSemua(u) {
  return String(u || '').split(/\r?\n/)
    .map(function (x) { return x.trim(); })
    .filter(function (x) { return /^https?:\/\//i.test(x); });
}

function chip(teks, bg, ink) {
  return '<span style="display:inline-block;background-color:' + bg + ';border-radius:99px;' +
    'padding:6px 13px;font-size:11px;font-weight:700;letter-spacing:.4px;color:' + ink + ';' + E_FONT + '">' +
    esc(teks) + '</span>';
}

function warnaStatus(status) {
  var s = String(status || '').toLowerCase();
  if (s.indexOf('selesai') >= 0 || s.indexOf('terbit') >= 0) return ['#E3F6EE', '#0B7A45'];
  if (s.indexOf('revisi') >= 0) return ['#FBF0D8', '#946200'];
  if (s.indexOf('kumpul') >= 0) return ['#EEEAFE', '#5B3FD6'];
  if (s.indexOf('kerjakan') >= 0) return ['#E4EFFA', '#12538F'];
  return ['#F4F6FA', E_INK2];
}

function warnaPrioritas(p) {
  var s = String(p || '').toLowerCase();
  if (s.indexOf('tinggi') >= 0) return ['#FBE7E7', '#B02A2A'];
  if (s.indexOf('sedang') >= 0) return ['#FBF0D8', '#946200'];
  return ['#E4EFFA', '#12538F'];
}

/** A list of labels and values. A row with an empty value is skipped. */
function blokRincian(pasangan) {
  var isi = '';
  for (var i = 0; i < pasangan.length; i++) {
    var label = pasangan[i][0], nilai = pasangan[i][1], mentah = pasangan[i][2];
    if (!nilai && nilai !== 0) continue;
    var akhir = (i === pasangan.length - 1);
    var garis = akhir ? '' : 'border-bottom:1px solid ' + E_LINE + ';';
    isi += '<tr>' +
      '<td valign="top" width="35%" style="padding:11px 14px 11px 0;' + garis + '">' +
        '<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:' + E_INK3 + ';' + E_FONT + '">' + esc(label) + '</div>' +
      '</td>' +
      '<td valign="top" style="padding:11px 0;' + garis + '">' +
        '<div style="font-size:13.5px;font-weight:600;color:' + E_INK + ';line-height:1.5;' + E_FONT + '">' +
        (mentah ? nilai : esc(nilai)) + '</div>' +
      '</td></tr>';
  }
  if (!isi) return '';
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="width:100%;border:1px solid ' + E_LINE + ';border-radius:14px;padding:4px 16px;background-color:#FBFCFE">' +
    isi + '</table>';
}

/** A note box with a left rule, used for task notes. */
function blokCatatan(judul, teks) {
  if (!String(teks || '').trim()) return '';
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%">' +
    '<tr><td style="background-color:#F4F6FA;border-left:3px solid ' + E_BIRU + ';border-radius:0 12px 12px 0;padding:13px 16px">' +
    '<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:' + E_INK3 + ';' + E_FONT + '">' + esc(judul) + '</div>' +
    '<div style="font-size:13.5px;color:' + E_INK2 + ';line-height:1.65;margin-top:6px;' + E_FONT + '">' + brk(teks) + '</div>' +
    '</td></tr></table>';
}

/** A comment bubble, mirroring the chat thread in the task drawer. */
function blokGelembung(oleh, waktu, teks, tautan) {
  var lamp = '';
  var u = urlAman(tautan);
  if (u) {
    lamp = '<div style="margin-top:10px"><a href="' + esc(u) + '" ' +
      'style="font-size:12.5px;font-weight:700;color:' + E_BIRU + ';text-decoration:none;' + E_FONT + '">&#128206; Buka lampiran</a></div>';
  }
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%">' +
    '<tr><td style="background-color:#E4EFFA;border-radius:16px 16px 16px 5px;padding:15px 17px">' +
    '<div style="font-size:12.5px;font-weight:700;color:#12538F;' + E_FONT + '">' + esc(oleh || 'Tanpa nama') +
      '<span style="font-weight:600;color:#7E97B8;font-size:11px"> &middot; ' + esc(waktuPanjang(waktu)) + '</span></div>' +
    (String(teks || '').trim() ? '<div style="font-size:14px;color:' + E_INK + ';line-height:1.65;margin-top:7px;' + E_FONT + '">' + brk(teks) + '</div>' : '') +
    lamp + '</td></tr></table>';
}

/** A bullet list for the weekly reminder. */
function blokDaftar(judul, items, sisa) {
  if (!items.length) return '';
  var isi = '';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var w = it.warna || ['#F4F6FA', E_INK2];
    isi += '<tr><td style="padding:12px 0;border-top:1px solid ' + E_LINE + '">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
      '<td valign="top">' +
        '<div style="font-size:13.5px;font-weight:700;color:' + E_INK + ';line-height:1.45;' + E_FONT + '">' + esc(it.judul) + '</div>' +
        '<div style="font-size:12px;color:' + E_INK3 + ';line-height:1.5;margin-top:3px;' + E_FONT + '">' + esc(it.meta) + '</div>' +
      '</td>' +
      (it.chip ? '<td valign="top" align="right" style="padding-left:10px;white-space:nowrap">' + chip(it.chip, w[0], w[1]) + '</td>' : '') +
      '</tr></table></td></tr>';
  }
  var ekor = sisa > 0 ? '<tr><td style="padding:10px 0 0;border-top:1px solid ' + E_LINE + '">' +
    '<div style="font-size:12px;color:' + E_INK3 + ';' + E_FONT + '">dan ' + sisa + ' entri lain di dashboard</div></td></tr>' : '';
  return '<div style="font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:' + E_INK3 + ';margin-bottom:2px;' + E_FONT + '">' + esc(judul) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%">' + isi + ekor + '</table>';
}

function blokAman(teks) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%">' +
    '<tr><td style="background-color:#E3F6EE;border-radius:14px;padding:15px 17px">' +
    '<div style="font-size:13.5px;font-weight:600;color:#0B7A45;line-height:1.6;' + E_FONT + '">' + esc(teks) + '</div>' +
    '</td></tr></table>';
}

function tombol(label, url) {
  var u = urlAman(url) || tautanHub('');
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td bgcolor="' + E_BIRU + '" style="background-color:' + E_BIRU + ';border-radius:11px">' +
    '<a href="' + esc(u) + '" style="display:inline-block;padding:14px 26px;font-size:13.5px;font-weight:700;' +
    'color:#FFFFFF;text-decoration:none;' + E_FONT + '">' + esc(label) + ' &rarr;</a>' +
    '</td></tr></table>';
}

/**
 * The main frame. o = { pra, chip, eyebrow, judul, ringkas, blok[], cta{label,url}, kaki }
 * The banner paints a solid colour first and only then a gradient, so that
 * Outlook, which discards gradients, still gets the navy background.
 */
function surelShell(o) {
  var blok = '';
  for (var i = 0; i < (o.blok || []).length; i++) {
    if (!o.blok[i]) continue;
    blok += '<tr><td style="padding-top:18px">' + o.blok[i] + '</td></tr>';
  }
  return '' +
'<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">' + esc(o.pra || '') + '</div>' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#EEF1F6;margin:0;padding:0">' +
'<tr><td align="center" style="padding:26px 12px">' +
  '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background-color:#FFFFFF;border:1px solid ' + E_LINE + ';border-radius:18px;overflow:hidden">' +

  '<tr><td bgcolor="#0E3560" style="background-color:#0E3560;background-image:linear-gradient(105deg,#08192E 0%,#0E3560 44%,#1D5E9E 74%,#2E85CE 100%);padding:24px 28px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
      '<td align="left" valign="middle">' +
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
          '<td width="44" valign="middle" style="padding-right:13px">' +
            '<div style="width:44px;height:44px;border-radius:13px;background-color:#2E85CE;text-align:center;line-height:44px;font-size:20px;color:#FFFFFF;' + E_FONT + '">&#9187;</div>' +
          '</td>' +
          '<td valign="middle">' +
            '<div style="font-size:20px;font-weight:800;letter-spacing:-.4px;color:#FFFFFF;line-height:1.1;' + E_FONT + '">CESGS<span style="color:#8FD6FF">Hub</span></div>' +
            '<div style="font-size:10px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#9BB4D4;margin-top:4px;' + E_FONT + '">Research Hub</div>' +
          '</td>' +
        '</tr></table>' +
      '</td>' +
      '<td align="right" valign="middle">' + (o.chip ? chip(o.chip, '#123A63', '#CFE4FA') : '') + '</td>' +
    '</tr></table>' +
  '</td></tr>' +

  '<tr><td bgcolor="' + E_BIRU + '" style="background-color:' + E_BIRU + ';background-image:linear-gradient(90deg,#1A6DC9 0%,#7A5AF8 100%);height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>' +

  '<tr><td style="padding:28px 28px 30px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
      '<tr><td>' +
        (o.eyebrow ? '<div style="font-size:11px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:' + E_INK3 + ';' + E_FONT + '">' + esc(o.eyebrow) + '</div>' : '') +
        '<div style="font-size:21px;font-weight:800;letter-spacing:-.4px;color:' + E_INK + ';line-height:1.3;margin-top:6px;' + E_FONT + '">' + esc(o.judul) + '</div>' +
        (o.ringkas ? '<div style="font-size:13.5px;color:' + E_INK2 + ';line-height:1.65;margin-top:9px;' + E_FONT + '">' + brk(o.ringkas) + '</div>' : '') +
      '</td></tr>' +
      blok +
      (o.cta ? '<tr><td style="padding-top:24px">' + tombol(o.cta.label, o.cta.url) + '</td></tr>' : '') +
    '</table>' +
  '</td></tr>' +

  '<tr><td bgcolor="#F7F9FC" style="background-color:#F7F9FC;border-top:1px solid ' + E_LINE + ';padding:18px 28px 22px">' +
    '<div style="font-size:11.5px;color:' + E_INK3 + ';line-height:1.7;' + E_FONT + '">' + brk(o.kaki || '') + '</div>' +
  '</td></tr>' +

  '</table>' +
  '<div style="font-size:11px;color:#A9B2C2;margin-top:14px;' + E_FONT + '">CESGS, Fakultas Ekonomi dan Bisnis, Universitas Airlangga</div>' +
'</td></tr></table>';
}

/**
 * The dashboard is a single HTML file that addresses its pages through the hash,
 * for example researchhub.example.org/#/tugas. A plain path such as /tugas does
 * not exist on the server and would land on a not-found page, so every button
 * inside an email uses the hash form.
 */
function tautanHub(halaman, param) {
  var b = String(HUB_URL || '').trim();
  if (!/^https?:\/\//i.test(b)) b = String(HUB_URL_FALLBACK || '').trim();
  b = b.replace(/[#\/]+$/, '') + '/';
  return b + (halaman ? '#/' + halaman + (param || '') : '');
}

function tautanTugas(uidTugas) {
  return tautanHub('tugas', uidTugas ? '?tugas=' + encodeURIComponent(uidTugas) : '');
}

function tautanProgres() {
  return tautanHub('luaran');
}

var KAKI_TUGAS = 'Surel otomatis dari CESGS Research Hub. Balasan ke alamat ini tidak dibaca, tulis tanggapan di utas komentar tugas supaya tercatat.';

/* ── email bodies ── */

function emailTugasBaru(t, kepada) {
  var peta = akunPeta();
  var picSurel = surelSemua(t.pic, peta);
  var untukSaya = picSurel.indexOf(String(kepada || '').toLowerCase()) >= 0;
  var picTeks = pisahOrang(t.pic).join(', ');
  var wS = warnaStatus(t.status), wP = warnaPrioritas(t.prioritas);

  var rincian = blokRincian([
    ['Project', t.project],
    ['Judul paper', t.paper],
    ['Penanggung jawab', picTeks],
    ['Tenggat', t.tenggat ? labelTenggat(t.tenggat) : 'tanpa tenggat'],
    ['Prioritas', t.prioritas ? chip(t.prioritas, wP[0], wP[1]) : '', true],
    ['Status', chip(t.status || 'Belum mulai', wS[0], wS[1]), true],
    ['Dibuat oleh', t.dibuat_oleh]
  ]);

  var lampiran = '';
  var u = urlAman(t.lampiran || t.berkas);
  if (u) lampiran = '<div style="' + E_FONT + '"><a href="' + esc(u) + '" style="font-size:13px;font-weight:700;color:' + E_BIRU + ';text-decoration:none">&#128206; Lampiran tugas</a></div>';

  var html = surelShell({
    pra: (t.project ? t.project + ' · ' : '') + (t.tenggat ? 'tenggat ' + tglPendek(t.tenggat) : 'tanpa tenggat'),
    chip: 'Tugas baru',
    eyebrow: 'Penugasan',
    judul: t.judul,
    ringkas: untukSaya
      ? (picSurel.length > 1
          ? 'Tugas ini ditujukan kepada Anda bersama ' + (picSurel.length - 1) + ' orang lain. Rinciannya di bawah, tanggapan cukup ditulis di utas komentar tugas.'
          : 'Tugas ini ditujukan kepada Anda. Rinciannya di bawah, tanggapan cukup ditulis di utas komentar tugas.')
      : 'Tugas baru masuk ke Research Hub dan Anda menerima tembusannya.',
    blok: [rincian, blokCatatan('Catatan', t.catatan), lampiran],
    cta: { label: 'Buka tugas', url: tautanTugas(t.uid) },
    kaki: KAKI_TUGAS
  });

  var teks = 'Tugas baru: ' + t.judul + '\n' +
    (t.project ? 'Project: ' + t.project + '\n' : '') +
    'PIC: ' + (picTeks || '-') + '\n' +
    'Tenggat: ' + (t.tenggat ? labelTenggat(t.tenggat) : 'tanpa tenggat') + '\n' +
    'Prioritas: ' + (t.prioritas || '-') + '\n' +
    'Status: ' + (t.status || 'Belum mulai') + '\n' +
    (t.catatan ? 'Catatan: ' + t.catatan + '\n' : '') +
    '\nBuka: ' + tautanTugas(t.uid);

  return {
    subjek: 'Tugas baru: ' + t.judul + (t.project ? ' \u00b7 ' + t.project : ''),
    html: html,
    teks: teks
  };
}

function emailKomentar(k, t) {
  var judul = t ? t.judul : 'Tugas';
  var wS = t ? warnaStatus(t.status) : ['#F4F6FA', E_INK2];

  var rincian = t ? blokRincian([
    ['Project', t.project],
    ['Penanggung jawab', pisahOrang(t.pic).join(', ')],
    ['Tenggat', t.tenggat ? labelTenggat(t.tenggat) : 'tanpa tenggat'],
    ['Status', chip(t.status || 'Belum mulai', wS[0], wS[1]), true]
  ]) : '';

  var html = surelShell({
    pra: String(k.teks || 'lampiran baru').slice(0, 120),
    chip: String(k.jenis || '') === 'status' ? 'Perubahan status' : 'Komentar baru',
    eyebrow: 'Utas tugas',
    judul: judul,
    ringkas: (k.oleh || 'Seseorang') + ' menulis di utas tugas ini.',
    blok: [blokGelembung(k.oleh, k.waktu, k.teks, k.tautan), rincian],
    cta: { label: 'Balas di Research Hub', url: tautanTugas(t ? t.uid : '') },
    kaki: KAKI_TUGAS
  });

  var teks = (k.oleh || 'Seseorang') + ' berkomentar di tugas "' + judul + '"\n' +
    waktuPanjang(k.waktu) + '\n\n' + String(k.teks || '') + '\n' +
    (urlAman(k.tautan) ? '\nLampiran: ' + k.tautan + '\n' : '') +
    '\nBalas: ' + tautanTugas(t ? t.uid : '');

  return {
    subjek: 'Komentar baru: ' + judul,
    html: html,
    teks: teks
  };
}

/* ═════════════ weekly progress reminder ═════════════ */

/** Date of the last progress note per target, both outputs and research rows. */
function progresTerakhir() {
  if (_CACHE.__prog) return _CACHE.__prog;
  var p = tabel(S_PROG, PROG_COLS), akhir = {};
  for (var i = 0; i < p.length; i++) {
    var k = String(p[i].target_uid || '').trim();
    var d = String(p[i].tanggal || '').trim() || String(p[i].waktu || '').slice(0, 10);
    if (!k || !d) continue;
    if (!akhir[k] || d > akhir[k]) akhir[k] = d;
  }
  _CACHE.__prog = akhir;
  return akhir;
}

/** Research rows still running, read once per process. */
function risetRows() {
  if (_CACHE.__riset) return _CACHE.__riset;
  var out = [];
  try {
    var sh = dataSheet();
    var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastRow > 1) {
      var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
      var m = colMap(headers);
      var vals = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
      for (var r = 0; r < vals.length; r++) {
        if (m.j == null) break;
        var judul = String(vals[r][m.j] || '').trim();
        if (!judul) continue;
        out.push({
          uid:    m.uid != null ? teks(vals[r][m.uid]) : '',
          judul:  judul,
          project: m.pr != null ? teks(vals[r][m.pr]) : '',
          status: m.st != null ? teks(vals[r][m.st]) : '',
          pj:     m.pj != null ? teks(vals[r][m.pj]) : '',
          anggota: m.anggota != null ? teks(vals[r][m.anggota]) : '',
          ds:     m.ds != null ? teks(vals[r][m.ds]) : '',
          target: m.tg != null ? teks(vals[r][m.tg]) : ''
        });
      }
    }
  } catch (e) { catatGalatNotif(e); }
  _CACHE.__riset = out;
  return out;
}

function tuntasKah(status) {
  return /selesai|terbit|publish|accepted|done|batal/i.test(String(status || ''));
}

function orangCocok(nilai, nama, mail, peta) {
  var daftar = pisahOrang(nilai);
  var target = String(mail || '').toLowerCase();
  for (var i = 0; i < daftar.length; i++) {
    var s = daftar[i];
    if (s.indexOf('@') > 0) { if (s.toLowerCase() === target) return true; continue; }
    if (nama && namaCocok(s, nama)) return true;
    if (surelUntuk(s, peta) === target) return true;
  }
  return false;
}

/** Builds one person's outstanding items: progress updates due and open tasks. */
function ringkasPengguna(mail) {
  var peta = akunPeta();
  var m = String(mail || '').toLowerCase();
  var a = peta.byMail[m];
  var nama = a ? String(a.nama || '') : '';
  var akhir = progresTerakhir();
  var perlu = [], tugasBuka = [];

  var luaran = tabel(S_LUARAN, LUARAN_COLS);
  for (var i = 0; i < luaran.length; i++) {
    var it = luaran[i];
    if (!orangCocok(it.pic, nama, m, peta)) continue;
    if (tuntasKah(it.status)) continue;
    var last = akhir[String(it.uid || '')] || '';
    var umur = last ? selisihHari(last) : null;
    if (umur !== null && umur < PENGINGAT_AMBANG_HARI) continue;
    perlu.push({
      judul: it.nama || it.jenis || 'Luaran tanpa nama',
      meta: (it.project ? it.project + ' \u00b7 ' : '') +
            (last ? 'catatan terakhir ' + tglPendek(last) : 'belum pernah ada catatan progres'),
      umur: umur === null ? 999 : umur,
      chip: umur === null ? 'belum ada' : umur + ' hari',
      warna: (umur === null || umur > 21) ? ['#FBE7E7', '#B02A2A'] : ['#FBF0D8', '#946200']
    });
  }

  var riset = risetRows();
  for (var r = 0; r < riset.length; r++) {
    var rs = riset[r];
    if (tuntasKah(rs.status)) continue;
    if (!orangCocok(rs.pj, nama, m, peta) && !orangCocok(rs.anggota, nama, m, peta) &&
        !orangCocok(rs.ds, nama, m, peta)) continue;
    var last2 = akhir[String(rs.uid || '')] || '';
    var umur2 = last2 ? selisihHari(last2) : null;
    if (umur2 !== null && umur2 < PENGINGAT_AMBANG_HARI) continue;
    perlu.push({
      judul: rs.judul,
      meta: (rs.project ? rs.project + ' \u00b7 ' : '') + (rs.status ? rs.status + ' \u00b7 ' : '') +
            (last2 ? 'catatan terakhir ' + tglPendek(last2) : 'belum pernah ada catatan progres'),
      umur: umur2 === null ? 999 : umur2,
      chip: umur2 === null ? 'belum ada' : umur2 + ' hari',
      warna: (umur2 === null || umur2 > 21) ? ['#FBE7E7', '#B02A2A'] : ['#FBF0D8', '#946200']
    });
  }

  var tugas = tabel(S_TUGAS, TUGAS_COLS);
  for (var t = 0; t < tugas.length; t++) {
    var tg = tugas[t];
    if (!orangCocok(tg.pic, nama, m, peta)) continue;
    var st = String(tg.status || '');
    if (/selesai/i.test(st)) continue;
    var telat = selisihHari(tg.tenggat);
    tugasBuka.push({
      judul: tg.judul || 'Tugas tanpa judul',
      meta: (tg.project ? tg.project + ' \u00b7 ' : '') + (st || 'Belum mulai') +
            (tg.tenggat ? ' \u00b7 ' + labelTenggat(tg.tenggat) : ''),
      urut: telat === null ? -9999 : telat,
      chip: (telat !== null && telat > 0) ? 'telat' : (st || 'Belum mulai'),
      warna: (telat !== null && telat > 0) ? ['#FBE7E7', '#B02A2A'] : warnaStatus(st)
    });
  }

  perlu.sort(function (x, y) { return y.umur - x.umur; });
  tugasBuka.sort(function (x, y) { return y.urut - x.urut; });
  return { nama: nama || m, perlu: perlu, tugas: tugasBuka };
}

function emailPengingat(mail) {
  var r = ringkasPengguna(mail);
  var sapa = r.nama ? 'Halo ' + String(r.nama).split(' ')[0] + ',' : 'Halo,';
  var blok = [];

  if (!r.perlu.length && !r.tugas.length) {
    blok.push(blokAman('Tidak ada tunggakan yang tercatat atas nama Anda pekan ini. Kalau ada kemajuan yang belum masuk, catat saja supaya rekap mingguan tetap utuh.'));
  } else {
    if (r.perlu.length) blok.push(blokDaftar('Perlu update progres', r.perlu.slice(0, 8), Math.max(r.perlu.length - 8, 0)));
    if (r.tugas.length) blok.push(blokDaftar('Tugas yang masih terbuka', r.tugas.slice(0, 6), Math.max(r.tugas.length - 6, 0)));
  }

  var ringkasTeks = r.perlu.length
    ? r.perlu.length + ' entri belum diperbarui lebih dari ' + PENGINGAT_AMBANG_HARI + ' hari' +
      (r.tugas.length ? ', dan ' + r.tugas.length + ' tugas masih terbuka' : '') + '.'
    : (r.tugas.length ? r.tugas.length + ' tugas masih terbuka atas nama Anda.' : 'Catatan Anda sudah rapi.');

  var html = surelShell({
    pra: ringkasTeks,
    chip: 'Pengingat mingguan',
    eyebrow: HARI_ID[PENGINGAT_HARI] + ' pagi',
    judul: 'Waktunya update progres',
    ringkas: sapa + '\n' + ringkasTeks + ' Update cukup satu menit lewat kotak progres di beranda.',
    blok: blok,
    cta: { label: 'Update progres sekarang', url: tautanProgres() },
    kaki: 'Pengingat otomatis tiap ' + HARI_ID[PENGINGAT_HARI] + ' pukul ' + PENGINGAT_JAM + '.00 dari CESGS Research Hub. Daftar di atas disusun dari catatan progres terakhir tiap luaran dan riset yang tercatat atas nama Anda.'
  });

  var baris = '';
  for (var i = 0; i < Math.min(r.perlu.length, 8); i++) baris += '- ' + r.perlu[i].judul + ' (' + r.perlu[i].meta + ')\n';
  for (var j = 0; j < Math.min(r.tugas.length, 6); j++) baris += '- Tugas: ' + r.tugas[j].judul + ' (' + r.tugas[j].meta + ')\n';

  return {
    subjek: 'Update progres ' + HARI_ID[PENGINGAT_HARI] + ' \u00b7 ' + (r.perlu.length + r.tugas.length) + ' entri menunggu',
    html: html,
    teks: sapa + '\n' + ringkasTeks + '\n\n' + baris + '\nBuka: ' + tautanProgres()
  };
}

/** The output name or research title behind one progress note. */
function namaTarget(id) {
  var l = cariBaris(S_LUARAN, LUARAN_COLS, id);
  if (l) return { nama: l.nama || l.jenis || id, project: l.project || '' };
  var riset = risetRows();
  for (var i = 0; i < riset.length; i++) {
    if (String(riset[i].uid) === String(id)) return { nama: riset[i].judul, project: riset[i].project || '' };
  }
  return { nama: '', project: '' };
}

function emailSebut(pg) {
  var t = namaTarget(pg.target_uid);
  var judul = t.nama || 'Catatan progres';
  var oleh = pg.oleh || 'Seorang rekan';

  var rincian = blokRincian([
    ['Project', t.project],
    ['Status', pg.status],
    ['Progres', pg.persen === '' || pg.persen === null || pg.persen === undefined ? '' : pg.persen + ' persen'],
    ['Tanggal', pg.tanggal ? tglPendek(pg.tanggal) : ''],
    ['Ditandai', pisahOrang(pg.sebut).join(', ')]
  ]);

  var html = surelShell({
    pra: String(pg.catatan || '').slice(0, 120),
    chip: 'Anda ditandai',
    eyebrow: 'Catatan progres',
    judul: judul,
    ringkas: oleh + ' menandai Anda pada catatan progres berikut.',
    blok: [blokGelembung(oleh, pg.waktu || pg.tanggal, pg.catatan, ''), rincian],
    cta: { label: 'Buka Update Progres', url: tautanProgres() },
    kaki: 'Surel otomatis dari CESGS Research Hub. Anda menerimanya karena nama Anda ditulis dengan awalan @ di catatan progres.'
  });

  return {
    subjek: 'Anda ditandai: ' + judul,
    html: html,
    teks: oleh + ' menandai Anda pada catatan progres "' + judul + '"\n' +
          (pg.tanggal ? tglPendek(pg.tanggal) + '\n' : '') + '\n' +
          String(pg.catatan || '') + '\n\nBuka: ' + tautanProgres()
  };
}

function emailTenggat(t) {
  var wS = warnaStatus(t.status), wP = warnaPrioritas(t.prioritas);
  var picTeks = pisahOrang(t.pic).join(', ');
  var sisa = selisihHari(t.tenggat);
  var kapan = sisa === -1 ? 'besok' : (sisa === 0 ? 'hari ini' : Math.abs(sisa) + ' hari lagi');

  var rincian = blokRincian([
    ['Project', t.project],
    ['Judul paper', t.paper],
    ['Penanggung jawab', picTeks],
    ['Tenggat', tglPendek(t.tenggat) + ' (' + kapan + ')'],
    ['Prioritas', t.prioritas ? chip(t.prioritas, wP[0], wP[1]) : '', true],
    ['Status', chip(t.status || 'Belum mulai', wS[0], wS[1]), true],
    ['Dibuat oleh', t.dibuat_oleh]
  ]);

  var html = surelShell({
    pra: 'Tenggat ' + kapan + ', ' + tglPendek(t.tenggat),
    chip: 'Tenggat ' + kapan,
    eyebrow: 'Peringatan tenggat',
    judul: t.judul,
    ringkas: 'Tugas ini jatuh tempo ' + kapan + '. Bila sudah selesai, ubah statusnya di Research Hub supaya peringatan berhenti.',
    blok: [rincian, blokCatatan('Catatan', t.catatan)],
    cta: { label: 'Buka tugas', url: tautanTugas(t.uid) },
    kaki: KAKI_TUGAS
  });

  return {
    subjek: 'Tenggat ' + kapan + ': ' + t.judul,
    html: html,
    teks: 'Tugas "' + t.judul + '" jatuh tempo ' + kapan + ', ' + tglPendek(t.tenggat) + '.\n' +
      (t.project ? 'Project: ' + t.project + '\n' : '') +
      'PIC: ' + (picTeks || '-') + '\n' +
      'Status: ' + (t.status || 'Belum mulai') + '\n\nBuka: ' + tautanTugas(t.uid)
  };
}

function pengingatMingguan() {
  if (!EMAIL_AKTIF || !EMAIL_PENGINGAT) return 'pengingat dimatikan';
  bersihkanCache();
  var peta = akunPeta();
  var tanda = hariIni();
  var ev = [];

  for (var i = 0; i < peta.aktif.length; i++) {
    var mail = String(peta.aktif[i].email || '').trim().toLowerCase();
    if (!mail || mail.indexOf('@') < 1) continue;
    if (!PENGINGAT_KIRIM_KOSONG) {
      var r = ringkasPengguna(mail);
      if (!r.perlu.length && !r.tugas.length) continue;
    }
    ev.push({ jenis: 'pengingat', ref: mail + '|' + tanda, kepada: [mail] });
  }
  for (var c = 0; c < TEMBUSAN_PENGINGAT.length; c++) {
    var m2 = String(TEMBUSAN_PENGINGAT[c] || '').trim().toLowerCase();
    if (m2 && m2.indexOf('@') > 0) ev.push({ jenis: 'pengingat', ref: m2 + '|' + tanda, kepada: [m2] });
  }

  var n = antreNotifikasi(ev);
  return 'pengingat diantre ' + n + ' surel, ' + kirimAntrean();
}

/* ═════════════ task deadline warning ═════════════
 * Unlike the new-task message, which is triggered by a sync, this one is
 * triggered by time. The RH_Tugas sheet is scanned once a day and any task
 * whose deadline falls tomorrow is queued to its PIC.
 */

function tglISO(v) {
  var d = parseWaktu(v);
  if (!d) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function tanggalTambah(n) {
  var d = new Date();
  d.setDate(d.getDate() + n);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function peringatanTenggat() {
  if (!EMAIL_AKTIF || !EMAIL_TENGGAT) return 'peringatan tenggat dimatikan';
  bersihkanCache();
  var peta = akunPeta();
  var sasaran = tanggalTambah(PERINGATAN_HARI_SEBELUM);
  var tugas = tabel(S_TUGAS, TUGAS_COLS);
  var ev = [];

  for (var i = 0; i < tugas.length; i++) {
    var t = tugas[i];
    if (tglISO(t.tenggat) !== sasaran) continue;
    if (/selesai/i.test(String(t.status || ''))) continue;
    if (!String(t.judul || '').trim()) continue;

    var kirim = surelSemua(t.pic, peta);
    if (PERINGATAN_KE_PEMBUAT) tambahSurel(kirim, surelUntuk(t.dibuat_oleh, peta));
    // The key contains the date, so a moved deadline raises a fresh warning
    // while a second scan on the same day produces no duplicate.
    var ref = String(t.uid || '') + '|' + sasaran;
    if (!kirim.length) {
      var belum = pisahOrang(t.pic);
      ev.push({ jenis: 'tenggat_tugas', ref: ref, kepada: [],
                nota: belum.length ? 'PIC tanpa akun bersurel, ' + belum.join(', ') : 'tugas tanpa PIC' });
      continue;
    }
    ev.push({ jenis: 'tenggat_tugas', ref: ref, kepada: kirim });
  }

  var jml = antreNotifikasi(ev);
  return 'peringatan tenggat ' + sasaran + ', diantre ' + jml + ' surel, ' + kirimAntrean();
}

/** Daily schedule keeper, called by the five-minute trigger. */
function cekTenggat() {
  if (!EMAIL_AKTIF || !EMAIL_TENGGAT) return '';
  var kini = new Date();
  if (kini.getHours() < PERINGATAN_JAM) return '';
  var prop = PropertiesService.getScriptProperties();
  var tanda = hariIni();
  if (prop.getProperty('tenggat_terakhir') === tanda) return '';
  prop.setProperty('tenggat_terakhir', tanda);
  return peringatanTenggat();
}

/**
 * Schedule keeper. Called every 5 minutes, acts only on the appointed day and
 * hour, and only once a day thanks to a marker in the script properties. If the
 * trigger is late because of quota, the message still goes out on the next
 * attempt the same day rather than being lost.
 */
function cekPengingat() {
  if (!EMAIL_AKTIF || !EMAIL_PENGINGAT) return '';
  var kini = new Date();
  if (kini.getDay() !== PENGINGAT_HARI) return '';
  if (kini.getHours() < PENGINGAT_JAM) return '';
  var prop = PropertiesService.getScriptProperties();
  var tanda = hariIni();
  if (prop.getProperty('pengingat_terakhir') === tanda) return '';
  prop.setProperty('pengingat_terakhir', tanda);
  return pengingatMingguan();
}

/* ═════════════ time triggers ═════════════ */

function pemicuLima() {
  var pesan = [];
  try { pesan.push(cekPengingat()); } catch (e) { pesan.push('weekly reminder failed, ' + pesanError(e)); }
  try { pesan.push(cekTenggat()); } catch (e3) { pesan.push('deadline warning failed, ' + pesanError(e3)); }
  try { pesan.push(kirimAntrean()); } catch (e2) { pesan.push('queue sending failed, ' + pesanError(e2)); }
  var s = pesan.filter(function (x) { return String(x || '').length; }).join(' | ');
  if (s) Logger.log(s);
  return s;
}

function installEmailTriggers() {
  var lama = ScriptApp.getProjectTriggers();
  var hapus = ['pemicuLima', 'kirimAntrean', 'pengingatMingguan', 'cekPengingat', 'cekTenggat', 'onPerubahanLembar'];
  for (var i = 0; i < lama.length; i++) {
    if (hapus.indexOf(lama[i].getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(lama[i]);
  }
  ScriptApp.newTrigger('pemicuLima').timeBased().everyMinutes(5).create();
  // Sheet change trigger: raises the revision marker so the dashboard knows
  // something is new without pulling every sheet on a timer.
  ScriptApp.newTrigger('onPerubahanLembar').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onChange().create();
  naikkanRev();
  var s = 'Five-minute trigger and sheet-change trigger installed. Progress reminder every ' + HARI_ID[PENGINGAT_HARI] +
          ' from ' + PENGINGAT_JAM + '.00, deadline warning ' + PERINGATAN_HARI_SEBELUM +
          ' day ahead, daily from ' + PERINGATAN_JAM + '.00, time zone ' + Session.getScriptTimeZone() + '.';
  Logger.log(s);
  return s;
}

function removeEmailTriggers() {
  var lama = ScriptApp.getProjectTriggers(), n = 0;
  var hapus = ['pemicuLima', 'kirimAntrean', 'pengingatMingguan', 'cekPengingat', 'cekTenggat', 'onPerubahanLembar'];
  for (var i = 0; i < lama.length; i++) {
    if (hapus.indexOf(lama[i].getHandlerFunction()) >= 0) { ScriptApp.deleteTrigger(lama[i]); n++; }
  }
  var s = n + ' trigger(s) removed.';
  Logger.log(s);
  return s;
}

/* ═════════════ manual checks ═════════════ */

/**
 * Run this once from the editor after pasting the file. It forces the
 * permission screens to appear (spreadsheet, Drive and Gmail at once) and then
 * reports whether the research sheet, the attachment folder and the mail path
 * are ready. Also available under its English name, checkSetup.
 */
function checkSetup() {
  var pesan = [];
  try {
    var sh = dataSheet();
    pesan.push('Research sheet readable, ' + sh.getName() + ', ' + Math.max(sh.getLastRow() - 1, 0) + ' rows.');
  } catch (e) {
    pesan.push('FAILED research sheet, ' + pesanError(e));
  }
  try {
    setup();
    pesan.push('Helper sheets ready, including ' + S_KOMENTAR + ' and ' + S_NOTIF + '.');
  } catch (e2) {
    pesan.push('FAILED helper sheets, ' + pesanError(e2));
  }
  try {
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    pesan.push('Attachment folder readable, ' + folder.getName() + '.');
  } catch (e3) {
    pesan.push('FAILED attachment folder, ' + pesanError(e3) +
      '. Make sure the Drive permission was granted and that the folder is owned by, or shared with, this account.');
  }
  try {
    pesan.push('Email quota left today ' + MailApp.getRemainingDailyQuota() + '.');
  } catch (e4) {
    pesan.push('FAILED mail access, ' + pesanError(e4));
  }
  try {
    var akun = akunPeta();
    pesan.push('Active accounts with an email address, ' + akun.aktif.length + '.');
  } catch (e5) {
    pesan.push('FAILED reading accounts, ' + pesanError(e5));
  }
  var semua = ScriptApp.getProjectTriggers();
  var pemicu = semua.filter(function (t) { return t.getHandlerFunction() === 'pemicuLima'; });
  var ubah = semua.filter(function (t) { return t.getHandlerFunction() === 'onPerubahanLembar'; });
  pesan.push(pemicu.length ? 'Five-minute trigger is installed.' : 'Trigger NOT installed, run installEmailTriggers.');
  pesan.push(ubah.length ? 'Sheet-change trigger installed, revision marker ' + revSekarang() + '.'
                         : 'Sheet-change trigger NOT installed, edits made directly in the spreadsheet will only be noticed on the next full pull.');
  pesan.push('Project time zone ' + Session.getScriptTimeZone() + '.');

  var hasil = pesan.join('\n');
  Logger.log(hasil);
  return hasil;
}

/**
 * Email self-check. Run this from the editor when you want to know whether the
 * notifications are actually able to go out, without waiting for Thursday.
 * It sends nothing. It reports the switches, the trigger, the schedule, the
 * queue and the mail quota, which together explain every case of "the email
 * never arrived".
 */
function emailDiagnostics() {
  var out = [];
  out.push('master switch EMAIL_AKTIF ' + EMAIL_AKTIF);
  out.push('new task ' + EMAIL_TUGAS_BARU + ', comment ' + EMAIL_KOMENTAR +
           ', mention ' + EMAIL_SEBUT + ', status change ' + EMAIL_UBAH_STATUS +
           ', weekly reminder ' + EMAIL_PENGINGAT + ', deadline warning ' + EMAIL_TENGGAT);

  var semua = ScriptApp.getProjectTriggers();
  var lima = semua.filter(function (t) { return t.getHandlerFunction() === 'pemicuLima'; });
  out.push(lima.length
    ? 'five-minute trigger installed, so the queue is drained automatically'
    : 'five-minute trigger NOT installed, nothing will ever be sent. Run installEmailTriggers');

  var tz = Session.getScriptTimeZone();
  var kini = new Date();
  out.push('project time zone ' + tz + ', local time now ' +
           Utilities.formatDate(kini, tz, 'EEEE yyyy-MM-dd HH:mm'));
  out.push('reminder scheduled every ' + HARI_ID[PENGINGAT_HARI] + ' from ' + PENGINGAT_JAM +
           '.00, threshold ' + PENGINGAT_AMBANG_HARI + ' days, send even when nothing is due: ' +
           PENGINGAT_KIRIM_KOSONG);

  var prop = PropertiesService.getScriptProperties();
  out.push('last reminder run marker ' + (prop.getProperty('pengingat_terakhir') || 'never'));

  try {
    var peta = akunPeta();
    var mails = [];
    for (var i = 0; i < peta.aktif.length; i++) {
      var m = String(peta.aktif[i].email || '').trim();
      if (m.indexOf('@') > 0) mails.push(m);
    }
    out.push('active accounts that would receive the reminder, ' + mails.length +
             (mails.length ? ', ' + mails.slice(0, 12).join(', ') + (mails.length > 12 ? ', and more' : '') : ''));
    if (!mails.length) out.push('nobody has a usable address in ' + S_AKUN + ', so no reminder can be delivered');
  } catch (e) {
    out.push('FAILED reading accounts, ' + pesanError(e));
  }

  try {
    var antre = readHelper(S_NOTIF, NOTIF_COLS);
    var hitung = {};
    for (var q = 0; q < antre.length; q++) {
      var st = String(antre[q].status || 'kosong');
      hitung[st] = (hitung[st] || 0) + 1;
    }
    var ring = [];
    for (var k in hitung) if (hitung.hasOwnProperty(k)) ring.push(k + ' ' + hitung[k]);
    out.push('queue ' + S_NOTIF + ', ' + (ring.length ? ring.join(', ') : 'empty'));
    var gagal = antre.filter(function (r) { return String(r.status || '') === 'gagal'; }).slice(-3);
    for (var g = 0; g < gagal.length; g++) out.push('last failure, ' + gagal[g].jenis + ', ' + gagal[g].galat);
  } catch (e2) {
    out.push('FAILED reading the queue, ' + pesanError(e2));
  }

  try { out.push('mail quota left today ' + MailApp.getRemainingDailyQuota()); }
  catch (e3) { out.push('FAILED mail access, ' + pesanError(e3) + '. Re-run checkSetup and accept the mail permission'); }

  out.push('dashboard address used in email buttons, ' + HUB_URL);

  var hasil = out.join('\n');
  Logger.log(hasil);
  return hasil;
}

/**
 * Sends one weekly reminder to whoever runs this function, right now, built
 * from real data. It bypasses the schedule and the queue, so nobody else
 * receives anything. This is the quickest way to see the actual email.
 */
function testReminderToMe() {
  var mail = Session.getEffectiveUser().getEmail();
  if (!mail) return 'The address of the running account could not be read.';
  var isi = emailPengingat(mail);
  var opsi = { to: mail, subject: '[TEST] ' + isi.subjek, htmlBody: isi.html, body: isi.teks, name: NAMA_PENGIRIM };
  if (BALAS_KE) opsi.replyTo = BALAS_KE;
  MailApp.sendEmail(opsi);
  var hasil = 'Test reminder sent to ' + mail + '. Nobody else was emailed.';
  Logger.log(hasil);
  return hasil;
}

/**
 * Runs the real weekly reminder immediately, for every active account, without
 * waiting for the scheduled day. Use it once to confirm the whole path works,
 * or to catch up after a week when the trigger was missing. It respects the
 * once-a-day guard, so a second run on the same day sends nothing.
 */
function sendWeeklyReminderNow() {
  var hasil = pengingatMingguan();
  PropertiesService.getScriptProperties().setProperty('pengingat_terakhir', hariIni());
  Logger.log(hasil);
  return hasil;
}

/**
 * Drains the queue by hand, for when you have just fixed a setting and do not
 * want to wait up to five minutes for the trigger.
 */
function sendQueueNow() {
  var hasil = kirimAntrean();
  Logger.log(hasil);
  return hasil;
}

/** Tests writing, foldering and sharing. The test file is deleted again. */
function testUpload() {
  var folder = folderUnggah('tugas', 'Uji Coba');
  var file = folder.createFile(Utilities.newBlob('uji', 'text/plain', 'uji-research-hub.txt'));
  var berbagi = aturBerbagi(file);
  var akar = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  var hasil = 'Test file created in ' + folder.getName() + ', sharing rule ' + berbagi +
    ', recognised as belonging to the attachment folder: ' + didalamFolder(file, akar);
  file.setTrashed(true);
  Logger.log(hasil);
  return hasil;
}

/** Tests attachment cleanup. A test file is created in the folder and removed. */
function testAttachmentCleanup() {
  var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  var file = folder.createFile(Utilities.newBlob('uji', 'text/plain', 'uji-buang-berkas.txt'));
  var url = 'https://drive.google.com/file/d/' + file.getId() + '/view';
  var n = buangBerkasDrive([url]);
  var hasil = 'Test file created and then trashed, files trashed ' + n +
              (n === 1 ? '. Cleanup works.' : '. Check DRIVE_FOLDER_ID and the Drive permission.');
  Logger.log(hasil);
  return hasil;
}

function testDriveRoot() {
  Logger.log(DriveApp.getRootFolder().getName());
}

/**
 * Sends three sample emails to the address of the script owner: new task,
 * comment, and the weekly reminder built from real data. Safe to run at any time.
 */
function sendSampleEmails() {
  bersihkanCache();
  var saya = Session.getEffectiveUser().getEmail();
  if (!saya) return 'The email address of the script owner could not be read';

  var contohTugas = {
    uid: 'contoh', judul: 'Finalisasi Table 4 dan robustness check',
    project: 'RKI 2026', paper: 'Board Cultural Diversity and Corporate Business Ethics',
    pic: 'Nama PIC', tenggat: Utilities.formatDate(new Date(Date.now() + 3 * 86400000), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    prioritas: 'Tinggi', status: 'Dikerjakan', dibuat_oleh: 'Project Manager',
    catatan: 'Pakai sampel yang sudah dibersihkan, lalu cocokkan angkanya dengan do-file terakhir sebelum tabel dikunci.'
  };
  var contohKomentar = {
    uid: 'contoh2', target_kind: 'tugas', target_uid: 'contoh', jenis: 'komentar',
    oleh: 'Rekan Tim', email: saya, waktu: waktuKini(),
    teks: 'Sudah saya cek, koefisiennya berubah kecil setelah winsorize. Tabelnya saya unggah di lampiran, mohon dikonfirmasi sebelum dikirim ke jurnal.'
  };

  var a = emailTugasBaru(contohTugas, saya);
  MailApp.sendEmail({ to: saya, subject: '[CONTOH] ' + a.subjek, htmlBody: a.html, body: a.teks, name: NAMA_PENGIRIM });
  var b = emailKomentar(contohKomentar, contohTugas);
  MailApp.sendEmail({ to: saya, subject: '[CONTOH] ' + b.subjek, htmlBody: b.html, body: b.teks, name: NAMA_PENGIRIM });
  var c = emailPengingat(saya);
  MailApp.sendEmail({ to: saya, subject: '[CONTOH] ' + c.subjek, htmlBody: c.html, body: c.teks, name: NAMA_PENGIRIM });

  var d = emailSebut({ uid: 'contoh3', target_uid: 'contoh', tanggal: hariIni(), status: 'Under review',
    persen: '70', oleh: 'Project Manager', waktu: waktuKini(), sebut: 'Anda',
    catatan: 'Draf revisi sudah masuk. @Anda tolong cek ulang Table 5 sebelum kita kirim balik ke editor.' });
  MailApp.sendEmail({ to: saya, subject: '[CONTOH] ' + d.subjek, htmlBody: d.html, body: d.teks, name: NAMA_PENGIRIM });

  var contohTenggat = {};
  for (var kk in contohTugas) contohTenggat[kk] = contohTugas[kk];
  contohTenggat.tenggat = tanggalTambah(PERINGATAN_HARI_SEBELUM);
  var e = emailTenggat(contohTenggat);
  MailApp.sendEmail({ to: saya, subject: '[CONTOH] ' + e.subjek, htmlBody: e.html, body: e.teks, name: NAMA_PENGIRIM });

  var hasil = 'Five sample emails sent to ' + saya + '. Quota left ' + MailApp.getRemainingDailyQuota() + '.';
  Logger.log(hasil);
  return hasil;
}

/** Shows the contents of the reminder without sending anything. */
function previewMyReminder() {
  bersihkanCache();
  var saya = Session.getEffectiveUser().getEmail();
  var r = ringkasPengguna(saya);
  var hasil = saya + '\nProgress updates due, ' + r.perlu.length + '\nOpen tasks, ' + r.tugas.length;
  for (var i = 0; i < Math.min(r.perlu.length, 10); i++) hasil += '\n  - ' + r.perlu[i].judul + ' (' + r.perlu[i].meta + ')';
  Logger.log(hasil);
  return hasil;
}

/** Forces the deadline scan to run now, ignoring the hour. */
function sendDeadlineWarningsNow() {
  PropertiesService.getScriptProperties().deleteProperty('tenggat_terakhir');
  var hasil = peringatanTenggat();
  Logger.log(hasil);
  return hasil;
}

/** Shows the tasks that would be warned about tomorrow, without sending. */
function previewTomorrowDeadlines() {
  bersihkanCache();
  var peta = akunPeta();
  var sasaran = tanggalTambah(PERINGATAN_HARI_SEBELUM);
  var tugas = tabel(S_TUGAS, TUGAS_COLS);
  var baris = ['Deadline ' + sasaran];
  for (var i = 0; i < tugas.length; i++) {
    var t = tugas[i];
    if (tglISO(t.tenggat) !== sasaran) continue;
    if (/selesai/i.test(String(t.status || ''))) continue;
    var kirim = surelSemua(t.pic, peta);
    baris.push('  ' + (t.judul || '(untitled)') + ' → ' +
      (kirim.length ? kirim.join(', ') : 'NO EMAIL ADDRESS, ' + t.pic));
  }
  if (baris.length === 1) baris.push('  no task falls due on that date');
  var hasil = baris.join('\n');
  Logger.log(hasil);
  return hasil;
}

/** Forces the weekly reminder to run now, ignoring the day and the hour. */
function sendWeeklyReminderNow() {
  PropertiesService.getScriptProperties().deleteProperty('pengingat_terakhir');
  var hasil = pengingatMingguan();
  Logger.log(hasil);
  return hasil;
}

/* ═════════════ backwards-compatible names ═════════════
 * The functions above were renamed to English. These one-line aliases keep the
 * old Indonesian names working, so an existing trigger or an old note that
 * still refers to them does not break. Nothing else calls them.
 */
function cekPasang() { return checkSetup(); }
function pasangPemicuEmail() { return installEmailTriggers(); }
function copotPemicuEmail() { return removeEmailTriggers(); }
function cekUnggah() { return testUpload(); }
function cekBuangBerkas() { return testAttachmentCleanup(); }
function cekDriveRoot() { return testDriveRoot(); }
function cekSurel() { return sendSampleEmails(); }
function cekPengingatSaya() { return previewMyReminder(); }
function kirimPengingatSekarang() { return sendWeeklyReminderNow(); }
function kirimTenggatSekarang() { return sendDeadlineWarningsNow(); }
function cekTenggatBesok() { return previewTomorrowDeadlines(); }
