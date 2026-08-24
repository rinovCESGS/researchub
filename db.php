<?php
/**
 * SIMS — sambungan basis data dan pembantu baca tulis.
 * Seluruh perintah memakai pernyataan tersiap, tanpa penyambungan string.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/schema.php';

function db() {
  static $pdo = null;
  if ($pdo === null) {
    $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    try {
      $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
      ]);
    } catch (PDOException $e) {
      http_response_code(500);
      exit(json_encode(['ok' => false, 'pesan' => 'Basis data tidak dapat dihubungi. Periksa config.php.']));
    }
  }
  return $pdo;
}

function tabelValid($tabel) {
  global $SKEMA;
  return isset($SKEMA[$tabel]);
}

/** Mengubah baris basis data menjadi bentuk yang dipakai dashboard. */
function bacaBaris($tabel, $row) {
  global $SKEMA;
  foreach ($SKEMA[$tabel]['json'] as $k) {
    if (!array_key_exists($k, $row)) continue;
    $v = $row[$k];
    $row[$k] = ($v === null || $v === '') ? null : json_decode($v, true);
  }
  return $row;
}

/** Membaca seluruh isi satu tabel. */
function bacaTabel($tabel, $where = '', $args = []) {
  if (!tabelValid($tabel)) return [];
  $sql = 'SELECT * FROM `' . $tabel . '`' . ($where ? ' WHERE ' . $where : '');
  $st = db()->prepare($sql);
  $st->execute($args);
  $out = [];
  foreach ($st->fetchAll() as $r) $out[] = bacaBaris($tabel, $r);
  return $out;
}

/** Menyimpan satu rekaman. Menimpa bila kuncinya sudah ada. */
function simpanBaris($tabel, $rec) {
  global $SKEMA;
  if (!tabelValid($tabel)) throw new Exception('Tabel ' . $tabel . ' tidak dikenali.');
  $def   = $SKEMA[$tabel];
  $kunci = $def['kunci'];
  if (empty($rec[$kunci])) $rec[$kunci] = substr($tabel, 0, 2) . '-' . bin2hex(random_bytes(4));

  $kolom = [];
  $nilai = [];
  foreach ($def['kolom'] as $k) {
    if (!array_key_exists($k, $rec)) continue;
    $v = $rec[$k];
    if (in_array($k, $def['json'], true)) $v = ($v === null) ? null : json_encode($v, JSON_UNESCAPED_UNICODE);
    elseif (is_bool($v)) $v = $v ? 1 : 0;
    elseif (is_array($v)) $v = json_encode($v, JSON_UNESCAPED_UNICODE);
    $kolom[] = $k;
    $nilai[] = $v;
  }
  if (!$kolom) return $rec;

  $tanda  = implode(',', array_fill(0, count($kolom), '?'));
  $backtick = '`' . implode('`,`', $kolom) . '`';
  $update = [];
  foreach ($kolom as $k) { if ($k !== $kunci) $update[] = '`' . $k . '`=VALUES(`' . $k . '`)'; }

  $sql = 'INSERT INTO `' . $tabel . '` (' . $backtick . ') VALUES (' . $tanda . ')';
  if ($update) $sql .= ' ON DUPLICATE KEY UPDATE ' . implode(',', $update);
  $st = db()->prepare($sql);
  $st->execute($nilai);
  return $rec;
}

/** Menulis banyak rekaman sekaligus, dipakai saat memindahkan data. */
function simpanBanyak($tabel, $daftar, $kosongkanDulu = false) {
  if (!tabelValid($tabel) || !$daftar) return 0;
  $pdo = db();
  $pdo->beginTransaction();
  try {
    if ($kosongkanDulu) $pdo->exec('DELETE FROM `' . $tabel . '`');
    foreach ($daftar as $rec) simpanBaris($tabel, $rec);
    $pdo->commit();
  } catch (Exception $e) {
    $pdo->rollBack();
    throw $e;
  }
  return count($daftar);
}

function hapusBaris($tabel, $id) {
  global $SKEMA;
  if (!tabelValid($tabel)) throw new Exception('Tabel tidak dikenali.');
  $st = db()->prepare('DELETE FROM `' . $tabel . '` WHERE `' . $SKEMA[$tabel]['kunci'] . '` = ?');
  $st->execute([$id]);
  return $st->rowCount() > 0;
}

/** Log hanya bisa ditambah. Tidak ada satu pun fungsi yang menghapusnya. */
function catatLog($oleh, $aksi, $ref = '') {
  try {
    simpanBaris('log', [
      'id'   => 'lg-' . bin2hex(random_bytes(5)),
      'tgl'  => date('Y-m-d H:i'),
      'oleh' => $oleh,
      'aksi' => $aksi,
      'ref'  => $ref,
      'ip'   => substr($_SERVER['REMOTE_ADDR'] ?? '', 0, 45),
    ]);
  } catch (Exception $e) { /* log gagal tidak boleh menjatuhkan permintaan */ }
}

function setelan($kunci, $nilai = null) {
  if ($nilai === null) {
    $r = bacaTabel('setelan', '`kunci` = ?', [$kunci]);
    return $r ? $r[0]['nilai'] : '';
  }
  simpanBaris('setelan', ['kunci' => $kunci, 'nilai' => $nilai]);
  return $nilai;
}
