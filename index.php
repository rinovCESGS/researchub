<?php
/**
 * SIMS — halaman utama.
 * Berkas ini menyajikan antarmuka lalu menyisipkan jembatan ke api.php,
 * sehingga seluruh data dibaca dan ditulis di basis data MySQL.
 */

require_once __DIR__ . '/auth.php';

$app = __DIR__ . '/app.html';
if (!is_file($app)) {
  exit('Berkas app.html tidak ditemukan. Unggah antarmuka SIMS dengan nama app.html di folder yang sama.');
}

$html = file_get_contents($app);

/* Jembatan disisipkan setelah seluruh skrip aplikasi supaya dapat menimpa
   fungsi penyimpanan bawaan yang semula memakai penyimpanan peramban. */
$jembatan = <<<'JS'
<script>
(function () {
  const API = 'api.php';

  function panggil(aksi, isi) {
    return fetch(API, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      credentials: 'same-origin',
      body: JSON.stringify(Object.assign({aksi: aksi}, isi || {}))
    }).then(function (r) { return r.json(); })
      .then(function (j) { if (!j || !j.ok) throw new Error(j && j.pesan ? j.pesan : 'Peladen tidak menjawab.'); return j.data; });
  }

  /* Salinan terakhir dari peladen, dipakai mencari rekaman yang berubah. */
  const KOLEKSI = ['tim','klien','project','rekening','kewajiban','libur','akun','periode','patuh','produksi',
    'analisa','konfirm','laporan','review','dokreq','lm','dok','tugas','internal','cuti','meeting','notulen',
    'aksi','pesan','notif','lampiran','invoice','bayar','lead','konten','target'];
  let SNAP = {};
  function peta(arr){ const m = {}; (arr || []).forEach(function (x) { if (x && (x.id || x.periode)) m[x.id || x.periode] = JSON.stringify(x); }); return m; }
  function simpanSnap(st){ SNAP = {}; KOLEKSI.forEach(function (k) { SNAP[k] = peta(st[k]); }); }

  window.SIMS = {
    masuk: function (surel, sandi) { return panggil('masuk', {surel: surel, sandi: sandi}); },
    keluar: function () { return panggil('keluar', {}); },
    gantiSandi: function (lama, baru) { return panggil('gantiSandi', {lama: lama, baru: baru}); },
    muat: function () { return panggil('keadaan', {}).then(function (st) { simpanSnap(st); return st; }); },
    isiLembar: function () { return panggil('isiTabel', {}); },
    setelan: function (kunci, nilai) { return panggil('setelan', {kunci: kunci, nilai: nilai}); },
    semai: function (isi, mode) { return panggil('semai', {isi: isi, mode: mode || 'ganti'}); },
    lampirTautan: function (ref, nama, url) { return panggil('lampirTautan', {ref: ref, nama: nama, url: url}); },
    hapusLampiran: function (id, alasan) { return panggil('hapusLampiran', {id: id, alasan: alasan}); },

    unggah: function (file, ref, onKemajuan) {
      if (file.size > 20 * 1024 * 1024) return Promise.reject(new Error('Berkas melebihi batas 20 MB.'));
      return new Promise(function (res, rej) {
        const fd = new FormData();
        fd.append('berkas', file); fd.append('ref', ref);
        const x = new XMLHttpRequest();
        x.open('POST', 'unggah.php');
        x.withCredentials = true;
        if (x.upload && onKemajuan) x.upload.onprogress = function (e) { if (e.lengthComputable) onKemajuan(Math.round(e.loaded / e.total * 96)); };
        x.onload = function () {
          let j = null;
          try { j = JSON.parse(x.responseText); } catch (e) { return rej(new Error('Jawaban peladen tidak terbaca.')); }
          if (!j.ok) return rej(new Error(j.pesan));
          if (onKemajuan) onKemajuan(100);
          res(j.data);
        };
        x.onerror = function () { rej(new Error('Sambungan terputus saat mengunggah.')); };
        x.send(fd);
      });
    },

    /* Mengirim hanya rekaman yang berubah sejak tarikan terakhir. */
    kirimPerubahan: function (st) {
      const ubah = [], hapus = [];
      KOLEKSI.forEach(function (k) {
        const kini = peta(st[k]), dulu = SNAP[k] || {};
        Object.keys(kini).forEach(function (id) { if (dulu[id] !== kini[id]) ubah.push({koleksi: k, rec: JSON.parse(kini[id])}); });
        Object.keys(dulu).forEach(function (id) { if (!kini[id]) hapus.push({koleksi: k, id: id}); });
      });
      if (!ubah.length && !hapus.length) return Promise.resolve({jumlah: 0});
      return panggil('simpanBanyak', {daftar: ubah}).then(function () {
        return Promise.all(hapus.map(function (h) {
          return panggil('hapus', {koleksi: h.koleksi, id: h.id, alasan: 'dihapus lewat antarmuka'});
        }));
      }).then(function () { simpanSnap(st); return {jumlah: ubah.length + hapus.length}; });
    }
  };

  /* ---- menyambungkan aplikasi ke peladen ---- */
  const tanda = document.getElementById('syncTxt');
  function status(t){ if (tanda) tanda.textContent = t; }

  let jeda = null;
  window.save = function () {
    clearTimeout(jeda);
    status('menyimpan');
    jeda = setTimeout(function () {
      SIMS.kirimPerubahan(S)
        .then(function () { status('tersimpan'); })
        .catch(function (e) { status('gagal simpan'); if (window.toast) toast(e.message); });
    }, 500);
  };

  window.masukSurel = function () {
    const mail = (document.getElementById('lgMail') || {}).value || '';
    const pass = (document.getElementById('lgPass') || {}).value || '';
    const box  = document.getElementById('lgErr');
    SIMS.masuk(mail, pass)
      .then(function () { return SIMS.muat(); })
      .then(function (st) {
        S = st;
        UI.page = S.peranSesi === 'klien' ? 'portal' : 'dash';
        UI.sel = {}; UI.tab = {}; UI.tbl = {};
        render();
      })
      .catch(function (e) { if (box) { box.textContent = e.message; box.style.display = 'block'; } });
  };

  window.keluarAkun = function () {
    SIMS.keluar().then(function () {
      S = seedKosong(); S.aktif = null;
      UI.page = 'dash'; UI.sel = {}; UI.tab = {};
      if (window.closeModal) closeModal();
      render();
    });
  };

  /* Muat keadaan awal. Bila sesi belum ada, halaman masuk yang tampil. */
  SIMS.muat().then(function (st) {
    S = st;
    UI.page = S.peranSesi === 'klien' ? 'portal' : 'dash';
    render();
    status('tersimpan');
  }).catch(function () {
    S = seedKosong(); S.aktif = null;
    render();
  });
})();
</script>
JS;

$html = str_replace('</body>', $jembatan . "\n</body>", $html);
$html = str_replace('<title>', '<title>' . htmlspecialchars(APP_NAMA) . ' — ', $html);

header('Content-Type: text/html; charset=utf-8');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: same-origin');
echo $html;
