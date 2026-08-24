<?php
/**
 * SIMS — unggahan lampiran.
 * Berkas disimpan di folder uploads dengan nama acak, sedangkan nama aslinya
 * hanya dicatat sebagai keterangan. Batasnya dua puluh megabita.
 */

require_once __DIR__ . '/auth.php';

header('Content-Type: application/json; charset=utf-8');

function balas($ok, $isi) {
  echo json_encode($ok ? ['ok' => true, 'data' => $isi] : ['ok' => false, 'pesan' => $isi], JSON_UNESCAPED_UNICODE);
  exit;
}

/* Jenis berkas yang diizinkan. Skrip dan berkas yang dapat dieksekusi ditolak. */
$IZIN = ['pdf','doc','docx','xls','xlsx','csv','ppt','pptx','txt','png','jpg','jpeg','gif','webp','zip','rar','xml','json'];

try {
  $s = wajibSesi();

  if (empty($_FILES['berkas'])) balas(false, 'Tidak ada berkas yang dikirim.');
  $f = $_FILES['berkas'];
  if ($f['error'] !== UPLOAD_ERR_OK) balas(false, 'Berkas gagal diterima peladen, kode ' . $f['error'] . '.');
  if ($f['size'] > BATAS_UNGGAH) balas(false, 'Berkas melebihi batas dua puluh megabita.');

  $ref = $_POST['ref'] ?? '';
  if ($ref === '') balas(false, 'Rujukan lampiran kosong.');

  $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
  if (!in_array($ext, $IZIN, true)) balas(false, 'Jenis berkas ' . $ext . ' tidak diizinkan.');

  /* Folder per klien supaya mudah ditelusuri. */
  $bagian = explode(':', $ref);
  $idKlien = '';
  if ($bagian[0] === 'klien') $idKlien = $bagian[1] ?? '';
  else {
    $petaTabel = ['tugas' => 'tugas', 'dok' => 'dok', 'lm' => 'lm', 'pesan' => 'pesan', 'meeting' => 'meeting', 'out' => 'lm'];
    $t = $petaTabel[$bagian[0]] ?? '';
    if ($t) {
      $r = bacaTabel($t, '`id` = ?', [$bagian[1] ?? '']);
      $idKlien = $r ? ($r[0]['klien'] ?? '') : '';
    }
  }
  $sub = $idKlien ?: 'internal';
  $dir = DIR_UNGGAH . '/' . preg_replace('/[^A-Za-z0-9_-]/', '', $sub);
  if (!is_dir($dir) && !mkdir($dir, 0755, true)) balas(false, 'Folder unggahan tidak dapat dibuat.');

  $namaSimpan = date('Ymd') . '-' . bin2hex(random_bytes(6)) . '.' . $ext;
  if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $namaSimpan)) balas(false, 'Berkas gagal disimpan.');

  $rec = [
    'id' => 'lp-' . bin2hex(random_bytes(4)), 'ref' => $ref, 'nama' => $f['name'], 'jenis' => 'berkas',
    'mime' => $f['type'] ?: 'application/octet-stream', 'ukuran' => $f['size'],
    'url' => URL_UNGGAH . '/' . basename($dir) . '/' . $namaSimpan, 'driveId' => '', 'dok' => '',
    'oleh' => $s['id'], 'tgl' => date('Y-m-d'), 'status' => 'siap',
  ];
  simpanBaris('lampiran', $rec);
  catatLog($s['id'], 'Mengunggah berkas ' . $f['name'] . ' (' . round($f['size'] / 1024) . ' KB) ke ' . $ref, 'Lampiran');
  balas(true, $rec);

} catch (Exception $e) {
  balas(false, $e->getMessage());
}
