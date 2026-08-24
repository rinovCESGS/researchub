<?php
/**
 * SIMS — akun, sesi, dan aturan akses.
 * Penyaringan data dilakukan di sini, bukan disembunyikan di peramban.
 */

require_once __DIR__ . '/db.php';

function mulaiSesi() {
  if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
      'lifetime' => UMUR_SESI,
      'path'     => '/',
      'httponly' => true,
      'samesite' => 'Lax',
      'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    ]);
    session_start();
  }
}

function sesi() {
  mulaiSesi();
  if (empty($_SESSION['sims']) || ($_SESSION['sims']['sampai'] ?? 0) < time()) return null;
  $_SESSION['sims']['sampai'] = time() + UMUR_SESI;
  return $_SESSION['sims'];
}

function wajibSesi() {
  $s = sesi();
  if (!$s) throw new Exception('Sesi berakhir. Silakan masuk lagi.');
  return $s;
}

function isMgr($s) { return in_array($s['peran'], ['manager', 'director'], true); }

/* ---------- percobaan masuk ---------- */

function kunciPercobaan($surel) {
  mulaiSesi();
  $k = 'gagal_' . md5(strtolower($surel));
  $n = $_SESSION[$k]['n'] ?? 0;
  $t = $_SESSION[$k]['t'] ?? 0;
  if ($t > time() - 900 && $n >= 8) throw new Exception('Terlalu banyak percobaan masuk. Coba lagi lima belas menit lagi.');
  return $k;
}
function tandaiGagal($k) {
  $n = ($_SESSION[$k]['t'] ?? 0) > time() - 900 ? ($_SESSION[$k]['n'] ?? 0) : 0;
  $_SESSION[$k] = ['n' => $n + 1, 't' => time()];
}

/* ---------- masuk dan keluar ---------- */

function masuk($surel, $sandi) {
  $surel = strtolower(trim($surel));
  $k = kunciPercobaan($surel);

  $u = bacaTabel('pengguna', 'LOWER(`email`) = ? AND `aktif` = 1', [$surel]);
  if ($u) {
    $u = $u[0];
    if (empty($u['sandi']) || !password_verify($sandi, $u['sandi'])) { tandaiGagal($k); throw new Exception('Surel atau kata sandi salah.'); }
    $s = ['id' => $u['id'], 'nama' => $u['nama'], 'peran' => $u['peran'], 'jabatan' => $u['jabatan'],
          'email' => $u['email'], 'klienId' => null, 'sampai' => time() + UMUR_SESI];
    mulaiSesi();
    session_regenerate_id(true);
    $_SESSION['sims'] = $s;
    catatLog($u['id'], 'Masuk ke sistem', 'Sistem');
    return ['sesi' => $s, 'wajibGanti' => (int)$u['wajibGanti'] === 1];
  }

  $c = bacaTabel('klien', 'LOWER(`login`) = ? AND `portal` = 1', [$surel]);
  if ($c) {
    $c = $c[0];
    if (empty($c['sandiKlien']) || !password_verify($sandi, $c['sandiKlien'])) { tandaiGagal($k); throw new Exception('Surel atau kata sandi salah.'); }
    $s = ['id' => $c['id'], 'nama' => $c['nama'], 'peran' => 'klien', 'jabatan' => 'Akun klien',
          'email' => $c['login'], 'klienId' => $c['id'], 'sampai' => time() + UMUR_SESI];
    mulaiSesi();
    session_regenerate_id(true);
    $_SESSION['sims'] = $s;
    catatLog($c['id'], 'Akun klien masuk ke portal', 'Sistem');
    return ['sesi' => $s, 'wajibGanti' => false];
  }

  tandaiGagal($k);
  throw new Exception('Surel atau kata sandi salah.');
}

function keluar() {
  $s = sesi();
  if ($s) catatLog($s['id'], 'Keluar dari sistem', 'Sistem');
  mulaiSesi();
  $_SESSION = [];
  session_destroy();
  return ['ok' => true];
}

function gantiSandi($lama, $baru) {
  $s = wajibSesi();
  if (strlen($baru) < 10) throw new Exception('Kata sandi baru minimal sepuluh karakter.');
  if ($s['peran'] === 'klien') {
    $c = bacaTabel('klien', '`id` = ?', [$s['klienId']])[0];
    if (!password_verify($lama, $c['sandiKlien'])) throw new Exception('Kata sandi lama salah.');
    simpanBaris('klien', ['id' => $c['id'], 'sandiKlien' => password_hash($baru, PASSWORD_DEFAULT)]);
  } else {
    $u = bacaTabel('pengguna', '`id` = ?', [$s['id']])[0];
    if (!password_verify($lama, $u['sandi'])) throw new Exception('Kata sandi lama salah.');
    simpanBaris('pengguna', ['id' => $u['id'], 'sandi' => password_hash($baru, PASSWORD_DEFAULT), 'wajibGanti' => 0]);
  }
  catatLog($s['id'], 'Kata sandi diganti sendiri', 'Sistem');
  return ['ok' => true];
}

/* ---------- aturan akses ---------- */

$AKSES_TULIS = [
  'klien' => ['manager','director'], 'project' => ['manager','director'], 'rekening' => ['manager','director'],
  'tim' => ['director'], 'kewajiban' => ['manager','director'], 'libur' => ['manager','director'], 'akun' => ['manager','director'],
  'periode' => ['staff','senior','asisten','manager','director'], 'patuh' => ['staff','senior','asisten','manager','director'],
  'produksi' => ['staff','senior','asisten','manager','director'], 'analisa' => ['staff','senior','asisten','manager','director'],
  'konfirm' => ['staff','senior','asisten','manager','director'], 'laporan' => ['staff','senior','asisten','manager','director'],
  'review' => ['senior','asisten','manager','director'], 'dokreq' => ['staff','senior','asisten','manager','director'],
  'lm' => ['staff','senior','asisten','manager','director'], 'dok' => ['staff','senior','asisten','manager','director'],
  'tugas' => ['staff','senior','asisten','admin','bizdev','manager','director','klien'],
  'internal' => ['staff','senior','asisten','admin','bizdev','manager','director'],
  'cuti' => ['staff','senior','asisten','admin','bizdev','manager','director'],
  'meeting' => ['senior','asisten','admin','bizdev','manager','director','klien'],
  'notulen' => ['senior','asisten','manager','director'], 'aksi' => ['senior','asisten','manager','director'],
  'pesan' => ['staff','senior','asisten','admin','bizdev','manager','director','klien'],
  'notif' => ['staff','senior','asisten','admin','bizdev','manager','director','klien'],
  'lampiran' => ['staff','senior','asisten','admin','bizdev','manager','director','klien'],
  'invoice' => ['admin','director'], 'bayar' => ['director'],
  'lead' => ['bizdev','admin','manager','director'], 'konten' => ['bizdev','manager','director'],
  'target' => ['manager','director'], 'gcal' => ['manager','director'], 'setelan' => ['manager','director'],
  'log' => [],
];

function bolehTulis($s, $koleksi) {
  global $AKSES_TULIS;
  return isset($AKSES_TULIS[$koleksi]) && in_array($s['peran'], $AKSES_TULIS[$koleksi], true);
}

/** Daftar id klien yang boleh dilihat sesi ini. */
function klienTerlihat($s) {
  $klien = bacaTabel('klien');
  if ($s['peran'] === 'klien') return [$s['klienId']];
  if (isMgr($s)) return array_column($klien, 'id');
  $ids = [];
  foreach (bacaTabel('project') as $p) {
    if ($p['pic'] === $s['id'] || $p['reviewer'] === $s['id']) $ids[$p['klien']] = 1;
  }
  foreach ($klien as $k) {
    foreach (['preparer','taxPic','supAwal','supAkhir','rev3','rev4'] as $f) {
      if (($k[$f] ?? '') === $s['id']) $ids[$k['id']] = 1;
    }
  }
  return array_keys($ids);
}

/** Menjaga agar orang tidak menulis ke klien yang bukan tanggung jawabnya. */
function jagaLingkup($s, $koleksi, $rec) {
  $boleh = klienTerlihat($s);

  if ($s['peran'] === 'klien') {
    if ($koleksi === 'tugas') {
      $asli = bacaTabel('tugas', '`id` = ?', [$rec['id'] ?? '']);
      if (!$asli || $asli[0]['klien'] !== $s['klienId'] || $asli[0]['pihak'] !== 'klien')
        throw new Exception('Tugas itu bukan milik Anda.');
      if ($asli[0]['judul'] !== ($rec['judul'] ?? $asli[0]['judul']) || $asli[0]['tenggat'] !== ($rec['tenggat'] ?? $asli[0]['tenggat']))
        throw new Exception('Klien hanya boleh mengubah status tugas.');
      return;
    }
    if ($koleksi === 'meeting') {
      if (($rec['klien'] ?? '') !== $s['klienId'] || ($rec['status'] ?? '') !== 'Diajukan Klien')
        throw new Exception('Klien hanya boleh mengajukan jadwal untuk dirinya sendiri.');
      return;
    }
    if ($koleksi === 'pesan') {
      if (($rec['klien'] ?? '') !== $s['klienId'] || empty($rec['klienAkses']))
        throw new Exception('Pesan itu di luar lingkup akun Anda.');
      return;
    }
    if (in_array($koleksi, ['notif','lampiran'], true)) return;
    throw new Exception('Akun klien tidak berhak mengubah ' . $koleksi . '.');
  }

  if (isMgr($s)) return;

  $idKlien = $rec['klien'] ?? null;
  if (!$idKlien && !empty($rec['project'])) {
    $p = bacaTabel('project', '`id` = ?', [$rec['project']]);
    $idKlien = $p ? $p[0]['klien'] : null;
  }
  if ($idKlien && !in_array($idKlien, $boleh, true)) throw new Exception('Klien itu bukan tanggung jawab Anda.');
}

/** Menyusun seluruh keadaan yang boleh dilihat sesi ini. */
function ambilKeadaan($s) {
  $boleh   = klienTerlihat($s);
  $manaj   = isMgr($s);
  $adaKl   = function ($id) use ($boleh) { return in_array($id, $boleh, true); };

  $project = array_values(array_filter(bacaTabel('project'), fn($p) => $adaKl($p['klien'])));
  $pid     = array_column($project, 'id');
  $prod    = array_values(array_filter(bacaTabel('produksi'), fn($x) => in_array($x['project'], $pid, true)));
  $prodId  = array_column($prod, 'id');
  $laporan = array_values(array_filter(bacaTabel('laporan'), fn($x) => in_array($x['prod'], $prodId, true)));
  $lapId   = array_column($laporan, 'id');
  $meeting = array_values(array_filter(bacaTabel('meeting'), fn($m) => !$m['klien'] || $adaKl($m['klien'])));
  $mtgId   = array_column($meeting, 'id');
  $notulen = array_values(array_filter(bacaTabel('notulen'),
              fn($n) => in_array($n['meeting'], $mtgId, true) && ($s['peran'] !== 'klien' || (int)$n['bagi'] === 1)));
  $notId   = array_column($notulen, 'id');
  $akuId   = $s['peran'] === 'klien' ? $s['klienId'] : $s['id'];

  $tim = array_map(function ($u) use ($s) {
    unset($u['salt'], $u['sandi'], $u['wajibGanti']);
    if ($s['peran'] === 'klien') return ['id'=>$u['id'],'nama'=>$u['nama'],'jabatan'=>$u['jabatan'],'peran'=>$u['peran'],'aktif'=>$u['aktif']];
    return $u;
  }, bacaTabel('pengguna'));

  $klien = array_map(function ($k) use ($manaj) {
    unset($k['saltKlien'], $k['sandiKlien']);
    if (!$manaj && !empty($k['npwp'])) $k['npwp'] = '••.•••.•••.•-•••.' . substr($k['npwp'], -3);
    return $k;
  }, array_values(array_filter(bacaTabel('klien'), fn($k) => $adaKl($k['id']))));

  return [
    'tim' => $tim,
    'klien' => $klien,
    'project' => array_map(function ($p) use ($s) { if ($s['peran'] !== 'director') $p['nilai'] = null; return $p; }, $project),
    'rekening' => array_map(function ($r) use ($manaj) {
        if (!$manaj) $r['no'] = '••••' . substr($r['no'], -4);
        return $r;
      }, array_values(array_filter(bacaTabel('rekening'), fn($r) => $adaKl($r['klien'])))),
    'kewajiban' => bacaTabel('kewajiban'),
    'libur' => bacaTabel('libur'),
    'akun' => bacaTabel('akun'),
    'periode' => bacaTabel('periode'),
    'patuh' => array_values(array_filter(bacaTabel('patuh'), fn($x) => in_array($x['project'], $pid, true))),
    'produksi' => $prod,
    'analisa' => array_values(array_filter(bacaTabel('analisa'), fn($x) => in_array($x['prod'], $prodId, true))),
    'konfirm' => array_values(array_filter(bacaTabel('konfirm'), fn($x) => in_array($x['prod'], $prodId, true))),
    'laporan' => $laporan,
    'review' => array_values(array_filter(bacaTabel('review'), fn($x) => in_array($x['laporan'], $lapId, true))),
    'dokreq' => array_values(array_filter(bacaTabel('dokreq'), fn($x) => $adaKl($x['klien']))),
    'lm' => array_values(array_filter(bacaTabel('lm'), fn($x) => $adaKl($x['klien']))),
    'dok' => array_values(array_filter(bacaTabel('dok'), fn($x) => $adaKl($x['klien']))),
    'tugas' => array_values(array_filter(bacaTabel('tugas'), function ($t) use ($s, $manaj, $adaKl) {
        if ($s['peran'] === 'klien') return $t['klien'] === $s['klienId'] && $t['pihak'] === 'klien';
        return $manaj || $t['pic'] === $s['id'] || ($t['klien'] && $adaKl($t['klien']));
      })),
    'internal' => $s['peran'] === 'klien' ? [] : bacaTabel('internal'),
    'cuti' => $s['peran'] === 'klien' ? [] : array_values(array_filter(bacaTabel('cuti'), fn($c) => $manaj || $c['tim'] === $s['id'])),
    'meeting' => $meeting,
    'notulen' => $notulen,
    'aksi' => array_values(array_filter(bacaTabel('aksi'), fn($a) => in_array($a['notulen'], $notId, true))),
    'pesan' => array_values(array_filter(bacaTabel('pesan'), function ($p) use ($s, $akuId) {
        $ikut = in_array($akuId, array_merge([$p['dari']], $p['ke'] ?: [], $p['cc'] ?: []), true);
        return $s['peran'] === 'klien' ? ($ikut && !empty($p['klienAkses'])) : $ikut;
      })),
    'notif' => array_values(array_filter(bacaTabel('notif'), fn($n) => in_array($akuId, $n['untuk'] ?: [], true))),
    'lampiran' => bacaTabel('lampiran'),
    'invoice' => in_array($s['peran'], ['director','admin','klien'], true)
        ? array_values(array_filter(bacaTabel('invoice'), fn($i) => $adaKl($i['klien']))) : [],
    'bayar' => $s['peran'] === 'director' ? bacaTabel('bayar') : [],
    'lead' => in_array($s['peran'], ['bizdev','admin','manager','director'], true)
        ? array_map(function ($l) use ($s) { if ($s['peran'] !== 'director') $l['nilai'] = null; return $l; }, bacaTabel('lead')) : [],
    'konten' => in_array($s['peran'], ['bizdev','manager','director'], true) ? bacaTabel('konten') : [],
    'target' => bacaTabel('target'),
    'gcal' => $s['peran'] === 'klien' ? [] : bacaTabel('gcal'),
    'log' => $manaj ? array_reverse(array_slice(bacaTabel('log'), -500)) : [],
    'aktif' => $akuId,
    'peranSesi' => $s['peran'],
    'periodeAktif' => setelan('periodeAktif') ?: date('Y-m'),
    'periodeKepatuhan' => setelan('periodeKepatuhan') ?: date('Y-m'),
  ];
}
