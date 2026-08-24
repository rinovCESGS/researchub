<?php
/**
 * SIMS — satu titik masuk untuk seluruh permintaan dari dashboard.
 * Bentuk permintaan: POST JSON {aksi, ...}. Balasan selalu JSON.
 */

require_once __DIR__ . '/auth.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function jawab($data) { echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE); exit; }
function gagal($pesan, $kode = 400) {
  http_response_code($kode);
  echo json_encode(['ok' => false, 'pesan' => $pesan], JSON_UNESCAPED_UNICODE);
  exit;
}

$mentah = file_get_contents('php://input');
$req    = json_decode($mentah, true);
if (!is_array($req)) $req = $_POST;
$aksi   = $req['aksi'] ?? '';

try {
  switch ($aksi) {

    case 'masuk':
      jawab(masuk($req['surel'] ?? '', $req['sandi'] ?? ''));

    case 'keluar':
      jawab(keluar());

    case 'gantiSandi':
      jawab(gantiSandi($req['lama'] ?? '', $req['baru'] ?? ''));

    case 'keadaan': {
      $s = wajibSesi();
      jawab(ambilKeadaan($s));
    }

    /* Menyimpan satu rekaman pada satu koleksi. */
    case 'simpan': {
      global $KOLEKSI, $SKEMA;
      $s = wajibSesi();
      $koleksi = $req['koleksi'] ?? '';
      $rec     = $req['rec'] ?? null;
      if (!isset($KOLEKSI[$koleksi])) gagal('Koleksi ' . $koleksi . ' tidak dikenali.');
      if (!is_array($rec)) gagal('Rekaman kosong.');
      if (!bolehTulis($s, $koleksi)) gagal('Peran Anda tidak berhak mengubah ' . $koleksi . '.', 403);
      jagaLingkup($s, $koleksi, $rec);
      if ($koleksi === 'tim') { unset($rec['salt'], $rec['sandi']); }
      $hasil = simpanBaris($KOLEKSI[$koleksi], $rec);
      catatLog($s['id'], 'Menyimpan ' . $koleksi . ' ' . ($rec['nama'] ?? $rec['judul'] ?? $rec['subjek'] ?? $hasil[$SKEMA[$KOLEKSI[$koleksi]]['kunci']] ?? ''), $koleksi);
      jawab($hasil);
    }

    /* Menyimpan beberapa rekaman lintas koleksi sekaligus. */
    case 'simpanBanyak': {
      global $KOLEKSI;
      $s = wajibSesi();
      $daftar = $req['daftar'] ?? [];
      foreach ($daftar as $x) {
        $k = $x['koleksi'] ?? '';
        if (!isset($KOLEKSI[$k])) gagal('Koleksi ' . $k . ' tidak dikenali.');
        if (!bolehTulis($s, $k)) gagal('Peran Anda tidak berhak mengubah ' . $k . '.', 403);
        jagaLingkup($s, $k, $x['rec'] ?? []);
      }
      foreach ($daftar as $x) simpanBaris($KOLEKSI[$x['koleksi']], $x['rec']);
      catatLog($s['id'], 'Menyimpan ' . count($daftar) . ' rekaman sekaligus', 'Sistem');
      jawab(['ok' => true, 'jumlah' => count($daftar)]);
    }

    case 'hapus': {
      global $KOLEKSI, $SKEMA;
      $s = wajibSesi();
      $koleksi = $req['koleksi'] ?? '';
      $alasan  = trim($req['alasan'] ?? '');
      if ($koleksi === 'log') gagal('Log tidak dapat dihapus.', 403);
      if (!isset($KOLEKSI[$koleksi])) gagal('Koleksi tidak dikenali.');
      if (!bolehTulis($s, $koleksi)) gagal('Peran Anda tidak berhak menghapus ' . $koleksi . '.', 403);
      if ($alasan === '') gagal('Alasan penghapusan wajib diisi.');
      $ok = hapusBaris($KOLEKSI[$koleksi], $req['id'] ?? '');
      catatLog($s['id'], 'Menghapus ' . $koleksi . ' ' . ($req['id'] ?? '') . '. Alasan: ' . $alasan, $koleksi);
      jawab(['ok' => $ok]);
    }

    /* Memindahkan seluruh isi dashboard ke basis data. Dipakai sekali saat pindah. */
    case 'semai': {
      global $KOLEKSI, $SKEMA;
      $s = wajibSesi();
      if (!isMgr($s)) gagal('Hanya Manager dan Director yang boleh memindahkan data.', 403);
      $isi  = $req['isi'] ?? [];
      $mode = ($req['mode'] ?? 'ganti') === 'ganti';
      $total = 0; $rincian = [];
      foreach ($KOLEKSI as $koleksi => $tabel) {
        if (in_array($koleksi, ['log','gcal','setelan'], true)) continue;
        $daftar = $isi[$koleksi] ?? [];
        if (!$daftar) continue;

        if ($koleksi === 'tim') {
          /* kredensial yang sudah ada tidak boleh tertimpa */
          $lama = [];
          foreach (bacaTabel('pengguna') as $u) $lama[$u['id']] = $u;
          foreach ($daftar as $u) {
            $l = $lama[$u['id']] ?? [];
            $u['salt']       = $l['salt'] ?? '';
            $u['sandi']      = $l['sandi'] ?? '';
            $u['wajibGanti'] = $l['wajibGanti'] ?? 1;
            simpanBaris('pengguna', $u);
          }
        } else {
          simpanBanyak($tabel, $daftar, $mode);
        }
        $total += count($daftar);
        $rincian[] = $tabel . ' ' . count($daftar);
      }
      catatLog($s['id'], 'Memindahkan data dashboard ke basis data, ' . $total . ' baris', 'Sistem');
      jawab(['total' => $total, 'rincian' => $rincian]);
    }

    case 'isiTabel': {
      global $KOLEKSI;
      wajibSesi();
      $out = [];
      foreach ($KOLEKSI as $k => $t) {
        $st = db()->query('SELECT COUNT(*) AS n FROM `' . $t . '`');
        $out[$k] = (int)$st->fetch()['n'];
      }
      jawab($out);
    }

    case 'setelan': {
      $s = wajibSesi();
      if (!array_key_exists('nilai', $req)) jawab(setelan($req['kunci'] ?? ''));
      if (!isMgr($s)) gagal('Peran Anda tidak berhak mengubah setelan.', 403);
      jawab(['ok' => true, 'nilai' => setelan($req['kunci'], $req['nilai'])]);
    }

    /* Membuat akun. Hanya Director. */
    case 'buatPengguna': {
      $s = wajibSesi();
      if ($s['peran'] !== 'director') gagal('Hanya Director yang boleh membuat akun.', 403);
      $sandi = $req['sandi'] ?? '';
      if (strlen($sandi) < 10) gagal('Kata sandi minimal sepuluh karakter.');
      $rec = [
        'id' => 'u-' . bin2hex(random_bytes(4)), 'nama' => $req['nama'] ?? '', 'email' => strtolower($req['email'] ?? ''),
        'peran' => $req['peran'] ?? 'staff', 'jabatan' => $req['jabatan'] ?? '', 'aktif' => 1,
        'masuk' => date('Y-m-d'), 'kontrak' => 'PKWT', 'kontrakAkhir' => '', 'cutiJatah' => 12,
        'salt' => '', 'sandi' => password_hash($sandi, PASSWORD_DEFAULT), 'wajibGanti' => 1,
      ];
      simpanBaris('pengguna', $rec);
      catatLog($s['id'], 'Membuat akun ' . $rec['email'] . ' dengan peran ' . $rec['peran'], 'Sistem');
      unset($rec['sandi']);
      jawab($rec);
    }

    /* Memberi akun portal kepada satu klien. */
    case 'akunKlien': {
      $s = wajibSesi();
      if (!isMgr($s)) gagal('Hanya Manager dan Director yang boleh membuat akun portal.', 403);
      $sandi = $req['sandi'] ?? '';
      if (strlen($sandi) < 10) gagal('Kata sandi minimal sepuluh karakter.');
      simpanBaris('klien', ['id' => $req['klien'] ?? '', 'portal' => 1,
        'login' => strtolower($req['login'] ?? ''), 'sandiKlien' => password_hash($sandi, PASSWORD_DEFAULT)]);
      catatLog($s['id'], 'Membuat akun portal untuk klien ' . ($req['klien'] ?? ''), 'C.1');
      jawab(['ok' => true]);
    }

    case 'lampirTautan': {
      $s = wajibSesi();
      $url = $req['url'] ?? '';
      if (!preg_match('~^https?://~i', $url)) gagal('Tautan harus diawali http atau https.');
      $rec = ['id' => 'lp-' . bin2hex(random_bytes(4)), 'ref' => $req['ref'] ?? '', 'nama' => $req['nama'] ?: substr($url, 0, 60),
        'jenis' => 'tautan', 'mime' => '', 'ukuran' => 0, 'url' => $url, 'driveId' => '', 'dok' => '',
        'oleh' => $s['id'], 'tgl' => date('Y-m-d'), 'status' => 'siap'];
      simpanBaris('lampiran', $rec);
      catatLog($s['id'], 'Melampirkan tautan pada ' . $rec['ref'], 'Lampiran');
      jawab($rec);
    }

    case 'hapusLampiran': {
      $s = wajibSesi();
      $alasan = trim($req['alasan'] ?? '');
      if ($alasan === '') gagal('Alasan wajib diisi.');
      $l = bacaTabel('lampiran', '`id` = ?', [$req['id'] ?? '']);
      if (!$l) gagal('Lampiran tidak ditemukan.');
      $l = $l[0];
      if (!isMgr($s) && $l['oleh'] !== $s['id']) gagal('Hanya pengunggah atau manajemen yang boleh melepas lampiran ini.', 403);
      hapusBaris('lampiran', $l['id']);
      catatLog($s['id'], 'Melepas lampiran ' . $l['nama'] . ' dari ' . $l['ref'] . '. Alasan: ' . $alasan, 'Lampiran');
      jawab(['ok' => true]);
    }

    default:
      gagal('Aksi ' . $aksi . ' tidak dikenali.', 404);
  }
} catch (Exception $e) {
  gagal($e->getMessage());
}
