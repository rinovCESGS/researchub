<?php
/**
 * SIMS — setelan sambungan.
 * Isi keempat baris pertama dengan data basis data MySQL dari hPanel Hostinger,
 * bagian Databases, MySQL Databases.
 */

define('DB_HOST', 'localhost');          // biasanya localhost di Hostinger
define('DB_PORT', '3306');
define('DB_NAME', 'u000000000_sims');    // ganti dengan nama basis data Anda
define('DB_USER', 'u000000000_sims');    // ganti dengan nama pengguna basis data
define('DB_PASS', 'ganti-kata-sandi');   // ganti dengan kata sandinya

/* Nama sistem yang tampil pada judul halaman. */
define('APP_NAMA', 'SIMS · Sage Internal Management System');

/* Folder lampiran. Harus dapat ditulis oleh peladen. */
define('DIR_UNGGAH', __DIR__ . '/uploads');
define('URL_UNGGAH', 'uploads');

/* Batas satu berkas lampiran, dua puluh megabita. */
define('BATAS_UNGGAH', 20 * 1024 * 1024);

/* Umur sesi dalam detik, delapan jam. */
define('UMUR_SESI', 8 * 3600);

/* Zona waktu, dipakai untuk seluruh tanggal dan jam. */
date_default_timezone_set('Asia/Jakarta');
