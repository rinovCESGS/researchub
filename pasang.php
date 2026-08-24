<?php
/**
 * SIMS — pemasangan sekali jalan.
 * Halaman ini menetapkan surel dan kata sandi Director pertama, lalu mengunci
 * dirinya sendiri. Setelah selesai, hapus berkas ini dari peladen.
 */

require_once __DIR__ . '/auth.php';

$pesan = '';
$sudah = false;

try {
  $adaSandi = db()->query("SELECT COUNT(*) AS n FROM `pengguna` WHERE `sandi` <> ''")->fetch()['n'];
  $sudah = (int)$adaSandi > 0;
} catch (Exception $e) {
  $pesan = 'Basis data belum siap. Impor sims_db.sql lebih dulu lewat phpMyAdmin, lalu isi config.php.';
}

if (!$sudah && $_SERVER['REQUEST_METHOD'] === 'POST') {
  $surel = strtolower(trim($_POST['surel'] ?? ''));
  $sandi = $_POST['sandi'] ?? '';
  $ulang = $_POST['ulang'] ?? '';
  $nama  = trim($_POST['nama'] ?? 'Director');

  if (!filter_var($surel, FILTER_VALIDATE_EMAIL)) $pesan = 'Surel tidak sah.';
  elseif (strlen($sandi) < 10)                    $pesan = 'Kata sandi minimal sepuluh karakter.';
  elseif ($sandi !== $ulang)                      $pesan = 'Kedua kata sandi tidak sama.';
  else {
    simpanBaris('pengguna', [
      'id' => 'u1', 'nama' => $nama, 'email' => $surel, 'peran' => 'director', 'jabatan' => 'Director',
      'aktif' => 1, 'masuk' => date('Y-m-d'), 'kontrak' => 'Tetap', 'kontrakAkhir' => '', 'cutiJatah' => 12,
      'salt' => '', 'sandi' => password_hash($sandi, PASSWORD_DEFAULT), 'wajibGanti' => 0,
    ]);
    catatLog('u1', 'Pemasangan pertama, akun Director dibuat', 'Sistem');
    $sudah = true;
    $pesan = 'Akun Director siap. Hapus berkas pasang.php dari peladen, lalu buka index.php untuk masuk.';
  }
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pemasangan SIMS</title>
<style>
body{margin:0;font-family:Inter,-apple-system,Segoe UI,sans-serif;background:#F3F7F9;color:#0A1F26;
  display:grid;place-items:center;min-height:100vh;padding:20px}
.kotak{background:#fff;border:1px solid #DFE8EC;border-radius:16px;padding:26px 24px;max-width:420px;width:100%;
  box-shadow:0 1px 2px rgba(6,42,51,.06),0 4px 14px rgba(6,42,51,.05)}
h1{font-size:21px;margin:0 0 4px}
p{font-size:13.5px;color:#5F7480;line-height:1.6}
label{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5F7480;font-weight:700;margin:14px 0 5px}
input{width:100%;box-sizing:border-box;border:1px solid #DFE8EC;border-radius:9px;padding:11px 12px;font:inherit;font-size:14px}
button{width:100%;margin-top:18px;border:0;border-radius:9px;padding:13px;background:#062A33;color:#fff;
  font:inherit;font-weight:700;letter-spacing:.08em;cursor:pointer}
.pesan{margin-top:14px;padding:10px 12px;border-radius:9px;font-size:13px;background:#EFF9FC;border:1px solid #CBE9F2;color:#14414E}
.selesai{background:#ECFDF5;border-color:#A7E3CD;color:#065F46}
</style>
</head>
<body>
<div class="kotak">
  <h1>Pemasangan SIMS</h1>
  <p>Isi surel dan kata sandi untuk akun Director pertama. Halaman ini hanya bekerja sekali,
     selama belum ada akun yang memiliki kata sandi.</p>

  <?php if ($sudah): ?>
    <div class="pesan selesai"><?= htmlspecialchars($pesan ?: 'Akun Director sudah ada. Halaman ini terkunci. Hapus berkas pasang.php dari peladen.') ?></div>
  <?php else: ?>
    <form method="post">
      <label>Nama</label><input name="nama" value="Director" required>
      <label>Surel</label><input name="surel" type="email" placeholder="director@sage.or.id" required>
      <label>Kata sandi</label><input name="sandi" type="password" required>
      <label>Ulangi kata sandi</label><input name="ulang" type="password" required>
      <button type="submit">Simpan dan kunci halaman ini</button>
    </form>
    <?php if ($pesan): ?><div class="pesan"><?= htmlspecialchars($pesan) ?></div><?php endif; ?>
  <?php endif; ?>
</div>
</body>
</html>
