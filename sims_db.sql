-- SIMS, Sage Internal Management System
-- Skema basis data MySQL. Impor lewat phpMyAdmin di Hostinger.
-- Dibuat otomatis dari skema aplikasi, jangan disunting manual.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `pengguna`;
CREATE TABLE `pengguna` (
  `id` VARCHAR(64) NOT NULL,
  `nama` VARCHAR(255) NULL,
  `email` VARCHAR(255) NULL,
  `peran` VARCHAR(255) NULL,
  `jabatan` VARCHAR(255) NULL,
  `aktif` TINYINT(1) NULL DEFAULT 0,
  `masuk` VARCHAR(255) NULL,
  `kontrak` VARCHAR(255) NULL,
  `kontrakAkhir` VARCHAR(255) NULL,
  `cutiJatah` DECIMAL(18,2) NULL DEFAULT 0,
  `salt` VARCHAR(255) NULL,
  `sandi` VARCHAR(255) NULL,
  `wajibGanti` TINYINT(1) NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `klien`;
CREATE TABLE `klien` (
  `id` VARCHAR(64) NOT NULL,
  `nama` VARCHAR(255) NULL,
  `alias` VARCHAR(255) NULL,
  `bentuk` VARCHAR(255) NULL,
  `npwp` VARCHAR(255) NULL,
  `group` VARCHAR(255) NULL,
  `prioritas` VARCHAR(255) NULL,
  `status` VARCHAR(255) NULL,
  `mulai` VARCHAR(255) NULL,
  `pic` VARCHAR(255) NULL,
  `kontak` VARCHAR(255) NULL,
  `email` VARCHAR(255) NULL,
  `drive` VARCHAR(255) NULL,
  `layanan` LONGTEXT NULL,
  `pkp` TINYINT(1) NULL DEFAULT 0,
  `preparer` VARCHAR(255) NULL,
  `taxPic` VARCHAR(255) NULL,
  `supAwal` VARCHAR(255) NULL,
  `supAkhir` VARCHAR(255) NULL,
  `rev3` VARCHAR(255) NULL,
  `rev4` VARCHAR(255) NULL,
  `nilaiA` DECIMAL(18,2) NULL DEFAULT 0,
  `nilaiT` DECIMAL(18,2) NULL DEFAULT 0,
  `sumber` VARCHAR(255) NULL,
  `lengkap` TINYINT(1) NULL DEFAULT 0,
  `onboard` LONGTEXT NULL,
  `portal` TINYINT(1) NULL DEFAULT 0,
  `login` VARCHAR(255) NULL,
  `saltKlien` VARCHAR(255) NULL,
  `sandiKlien` VARCHAR(255) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `project`;
CREATE TABLE `project` (
  `id` VARCHAR(64) NOT NULL,
  `klien` VARCHAR(255) NULL,
  `jenis` VARCHAR(255) NULL,
  `pic` VARCHAR(255) NULL,
  `reviewer` VARCHAR(255) NULL,
  `mulai` VARCHAR(255) NULL,
  `status` VARCHAR(255) NULL,
  `nilai` DECIMAL(18,2) NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `rekening`;
CREATE TABLE `rekening` (
  `id` VARCHAR(64) NOT NULL,
  `klien` VARCHAR(255) NULL,
  `bank` VARCHAR(255) NULL,
  `no` VARCHAR(255) NULL,
  `mata` VARCHAR(255) NULL,
  `aktif` TINYINT(1) NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `kewajiban`;
CREATE TABLE `kewajiban` (
  `id` VARCHAR(64) NOT NULL,
  `kode` VARCHAR(255) NULL,
  `nama` VARCHAR(255) NULL,
  `kategori` VARCHAR(255) NULL,
  `acuan` VARCHAR(255) NULL,
  `hari` DECIMAL(18,2) NULL DEFAULT 0,
  `akhirBulan` TINYINT(1) NULL DEFAULT 0,
  `geser` TINYINT(1) NULL DEFAULT 0,
  `dasar` TEXT NULL,
  `perluSetor` TINYINT(1) NULL DEFAULT 0,
  `aktif` TINYINT(1) NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `libur`;
CREATE TABLE `libur` (
  `id` VARCHAR(64) NOT NULL,
  `tgl` VARCHAR(255) NULL,
  `ket` VARCHAR(255) NULL,
  `tahun` DECIMAL(18,2) NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `akun`;
CREATE TABLE `akun` (
  `id` VARCHAR(64) NOT NULL,
  `kode` VARCHAR(255) NULL,
  `nama` VARCHAR(255) NULL,
  `arah` VARCHAR(255) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `periode`;
CREATE TABLE `periode` (
  `id` VARCHAR(64) NOT NULL,
  `periode` VARCHAR(255) NULL,
  `kw` VARCHAR(255) NULL,
  `jtRaw` VARCHAR(255) NULL,
  `jt` VARCHAR(255) NULL,
  `verif` TINYINT(1) NULL DEFAULT 0,
  `oleh` VARCHAR(255) NULL,
  `tglVerif` VARCHAR(255) NULL,
  `kunci` TINYINT(1) NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `patuh`;
CREATE TABLE `patuh` (
  `id` VARCHAR(64) NOT NULL,
  `project` VARCHAR(255) NULL,
  `periode` VARCHAR(255) NULL,
  `kw` VARCHAR(255) NULL,
  `jt` VARCHAR(255) NULL,
  `billing` TINYINT(1) NULL DEFAULT 0,
  `billingTgl` VARCHAR(255) NULL,
  `billingBukti` VARCHAR(255) NULL,
  `bayar` TINYINT(1) NULL DEFAULT 0,
  `bayarTgl` VARCHAR(255) NULL,
  `bayarBukti` VARCHAR(255) NULL,
  `nominal` DECIMAL(18,2) NULL DEFAULT 0,
  `lapor` TINYINT(1) NULL DEFAULT 0,
  `laporTgl` VARCHAR(255) NULL,
  `laporBukti` VARCHAR(255) NULL,
  `catatan` TEXT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `produksi`;
CREATE TABLE `produksi` (
  `id` VARCHAR(64) NOT NULL,
  `project` VARCHAR(255) NULL,
  `periode` VARCHAR(255) NULL,
  `tahap` VARCHAR(255) NULL,
  `diterima` VARCHAR(255) NULL,
  `batasAnalisa` VARCHAR(255) NULL,
  `batasLaporan` VARCHAR(255) NULL,
  `catatan` TEXT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `analisa`;
CREATE TABLE `analisa` (
  `id` VARCHAR(64) NOT NULL,
  `prod` VARCHAR(255) NULL,
  `rek` VARCHAR(255) NULL,
  `periode` VARCHAR(255) NULL,
  `batas` VARCHAR(255) NULL,
  `selesai` VARCHAR(255) NULL,
  `saldoAwal` DECIMAL(18,2) NULL DEFAULT 0,
  `saldoAkhir` DECIMAL(18,2) NULL DEFAULT 0,
  `masuk` DECIMAL(18,2) NULL DEFAULT 0,
  `keluar` DECIMAL(18,2) NULL DEFAULT 0,
  `kertas` VARCHAR(255) NULL,
  `status` VARCHAR(255) NULL,
  `pic` VARCHAR(255) NULL,
  `pos` LONGTEXT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `konfirm`;
CREATE TABLE `konfirm` (
  `id` VARCHAR(64) NOT NULL,
  `prod` VARCHAR(255) NULL,
  `item` VARCHAR(255) NULL,
  `saldo` VARCHAR(255) NULL,
  `tambah` VARCHAR(255) NULL,
  `link` VARCHAR(255) NULL,
  `status` VARCHAR(255) NULL,
  `tglKonfirm` VARCHAR(255) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `laporan`;
CREATE TABLE `laporan` (
  `id` VARCHAR(64) NOT NULL,
  `prod` VARCHAR(255) NULL,
  `project` VARCHAR(255) NULL,
  `periode` VARCHAR(255) NULL,
  `batas` VARCHAR(255) NULL,
  `lr` VARCHAR(255) NULL,
  `nr` VARCHAR(255) NULL,
  `cf` VARCHAR(255) NULL,
  `mgmt` VARCHAR(255) NULL,
  `rekon` TINYINT(1) NULL DEFAULT 0,
  `status` VARCHAR(255) NULL,
  `final` TINYINT(1) NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `review`;
CREATE TABLE `review` (
  `id` VARCHAR(64) NOT NULL,
  `laporan` VARCHAR(255) NULL,
  `tahap` VARCHAR(255) NULL,
  `reviewer` VARCHAR(255) NULL,
  `fokus` VARCHAR(255) NULL,
  `batas` VARCHAR(255) NULL,
  `status` VARCHAR(255) NULL,
  `rumus` VARCHAR(255) NULL,
  `detail` VARCHAR(255) NULL,
  `catatan` TEXT NULL,
  `tgl` VARCHAR(255) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `dokreq`;
CREATE TABLE `dokreq` (
  `id` VARCHAR(64) NOT NULL,
  `klien` VARCHAR(255) NULL,
  `project` VARCHAR(255) NULL,
  `siklus` VARCHAR(255) NULL,
  `periode` VARCHAR(255) NULL,
  `diminta` VARCHAR(255) NULL,
  `diterima` VARCHAR(255) NULL,
  `status` VARCHAR(255) NULL,
  `pic` VARCHAR(255) NULL,
  `jenis` LONGTEXT NULL,
  `drive` VARCHAR(255) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `lm`;
CREATE TABLE `lm` (
  `id` VARCHAR(64) NOT NULL,
  `klien` VARCHAR(255) NULL,
  `periode` VARCHAR(255) NULL,
  `link` VARCHAR(255) NULL,
  `preparer` VARCHAR(255) NULL,
  `taxPic` VARCHAR(255) NULL,
  `supAwal` VARCHAR(255) NULL,
  `supAkhir` VARCHAR(255) NULL,
  `rev3` VARCHAR(255) NULL,
  `rev4` VARCHAR(255) NULL,
  `out` LONGTEXT NULL,
  `pajak` LONGTEXT NULL,
  `cek` LONGTEXT NULL,
  `deliverable` TEXT NULL,
  `deliverTo` VARCHAR(255) NULL,
  `deliverBy` VARCHAR(255) NULL,
  `batasPajak` VARCHAR(255) NULL,
  `custom` TINYINT(1) NULL DEFAULT 0,
  `kirim` VARCHAR(255) NULL,
  `umpan` TEXT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `dokumen`;
CREATE TABLE `dokumen` (
  `id` VARCHAR(64) NOT NULL,
  `klien` VARCHAR(255) NULL,
  `periode` VARCHAR(255) NULL,
  `jenis` VARCHAR(255) NULL,
  `nama` VARCHAR(255) NULL,
  `link` VARCHAR(255) NULL,
  `oleh` VARCHAR(255) NULL,
  `tgl` VARCHAR(255) NULL,
  `catatan` TEXT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `tugas`;
CREATE TABLE `tugas` (
  `id` VARCHAR(64) NOT NULL,
  `judul` VARCHAR(255) NULL,
  `klien` VARCHAR(255) NULL,
  `project` VARCHAR(255) NULL,
  `siklus` VARCHAR(255) NULL,
  `pic` VARCHAR(255) NULL,
  `pihak` VARCHAR(255) NULL,
  `tenggat` VARCHAR(255) NULL,
  `status` VARCHAR(255) NULL,
  `catatan` TEXT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `cuti`;
CREATE TABLE `cuti` (
  `id` VARCHAR(64) NOT NULL,
  `tim` VARCHAR(255) NULL,
  `jenis` VARCHAR(255) NULL,
  `mulai` VARCHAR(255) NULL,
  `selesai` VARCHAR(255) NULL,
  `status` VARCHAR(255) NULL,
  `penyetuju` VARCHAR(255) NULL,
  `alasan` TEXT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `meeting`;
CREATE TABLE `meeting` (
  `id` VARCHAR(64) NOT NULL,
  `jenis` VARCHAR(255) NULL,
  `klien` VARCHAR(255) NULL,
  `tgl` VARCHAR(255) NULL,
  `jam` VARCHAR(255) NULL,
  `durasi` DECIMAL(18,2) NULL DEFAULT 0,
  `mode` VARCHAR(255) NULL,
  `link` VARCHAR(255) NULL,
  `lokasi` VARCHAR(255) NULL,
  `peserta` LONGTEXT NULL,
  `luar` LONGTEXT NULL,
  `gcal` VARCHAR(255) NULL,
  `gcalId` VARCHAR(255) NULL,
  `gcalLink` VARCHAR(255) NULL,
  `gcalStatus` VARCHAR(255) NULL,
  `gcalKirim` VARCHAR(255) NULL,
  `status` VARCHAR(255) NULL,
  `usul` TEXT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `notulen`;
CREATE TABLE `notulen` (
  `id` VARCHAR(64) NOT NULL,
  `meeting` VARCHAR(255) NULL,
  `ringkas` TEXT NULL,
  `oleh` VARCHAR(255) NULL,
  `tgl` VARCHAR(255) NULL,
  `bagi` TINYINT(1) NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `aksi`;
CREATE TABLE `aksi` (
  `id` VARCHAR(64) NOT NULL,
  `notulen` VARCHAR(255) NULL,
  `uraian` TEXT NULL,
  `pic` VARCHAR(255) NULL,
  `tenggat` VARCHAR(255) NULL,
  `status` VARCHAR(255) NULL,
  `gcal` VARCHAR(255) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `pesan`;
CREATE TABLE `pesan` (
  `id` VARCHAR(64) NOT NULL,
  `subjek` VARCHAR(255) NULL,
  `dari` VARCHAR(255) NULL,
  `ke` LONGTEXT NULL,
  `cc` LONGTEXT NULL,
  `keLuar` LONGTEXT NULL,
  `ccLuar` LONGTEXT NULL,
  `klien` VARCHAR(255) NULL,
  `klienAkses` TINYINT(1) NULL DEFAULT 0,
  `pesan` LONGTEXT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `notif`;
CREATE TABLE `notif` (
  `id` VARCHAR(64) NOT NULL,
  `untuk` LONGTEXT NULL,
  `judul` VARCHAR(255) NULL,
  `teks` TEXT NULL,
  `page` VARCHAR(255) NULL,
  `ref` VARCHAR(255) NULL,
  `tgl` VARCHAR(255) NULL,
  `jam` VARCHAR(255) NULL,
  `baca` LONGTEXT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `invoice`;
CREATE TABLE `invoice` (
  `id` VARCHAR(64) NOT NULL,
  `no` VARCHAR(255) NULL,
  `klien` VARCHAR(255) NULL,
  `periode` VARCHAR(255) NULL,
  `nilai` DECIMAL(18,2) NULL DEFAULT 0,
  `ppn` DECIMAL(18,2) NULL DEFAULT 0,
  `total` DECIMAL(18,2) NULL DEFAULT 0,
  `terbit` VARCHAR(255) NULL,
  `kirim` VARCHAR(255) NULL,
  `jt` VARCHAR(255) NULL,
  `status` VARCHAR(255) NULL,
  `berkas` VARCHAR(255) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `bayar`;
CREATE TABLE `bayar` (
  `id` VARCHAR(64) NOT NULL,
  `invoice` VARCHAR(255) NULL,
  `tgl` VARCHAR(255) NULL,
  `nominal` DECIMAL(18,2) NULL DEFAULT 0,
  `bukti` VARCHAR(255) NULL,
  `catatan` TEXT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `lead`;
CREATE TABLE `lead` (
  `id` VARCHAR(64) NOT NULL,
  `nama` VARCHAR(255) NULL,
  `bidang` VARCHAR(255) NULL,
  `pic` VARCHAR(255) NULL,
  `kontak` VARCHAR(255) NULL,
  `sumber` VARCHAR(255) NULL,
  `pemilik` VARCHAR(255) NULL,
  `jasa` VARCHAR(255) NULL,
  `nilai` DECIMAL(18,2) NULL DEFAULT 0,
  `lingkup` TEXT NULL,
  `tahap` VARCHAR(255) NULL,
  `penawaranTgl` VARCHAR(255) NULL,
  `followTgl` VARCHAR(255) NULL,
  `hasil` TEXT NULL,
  `pks` LONGTEXT NULL,
  `nda` LONGTEXT NULL,
  `deal` TINYINT(1) NULL DEFAULT 0,
  `alasan` TEXT NULL,
  `followLagi` VARCHAR(255) NULL,
  `konversi` TINYINT(1) NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `konten`;
CREATE TABLE `konten` (
  `id` VARCHAR(64) NOT NULL,
  `kanal` VARCHAR(255) NULL,
  `jenis` VARCHAR(255) NULL,
  `pilar` VARCHAR(255) NULL,
  `judul` VARCHAR(255) NULL,
  `pic` VARCHAR(255) NULL,
  `take` VARCHAR(255) NULL,
  `post` VARCHAR(255) NULL,
  `status` VARCHAR(255) NULL,
  `materi` TEXT NULL,
  `tautan` VARCHAR(255) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `lampiran`;
CREATE TABLE `lampiran` (
  `id` VARCHAR(64) NOT NULL,
  `ref` VARCHAR(255) NULL,
  `nama` VARCHAR(255) NULL,
  `jenis` VARCHAR(255) NULL,
  `mime` VARCHAR(255) NULL,
  `ukuran` DECIMAL(18,2) NULL DEFAULT 0,
  `url` VARCHAR(255) NULL,
  `driveId` VARCHAR(255) NULL,
  `dok` VARCHAR(255) NULL,
  `oleh` VARCHAR(255) NULL,
  `tgl` VARCHAR(255) NULL,
  `status` VARCHAR(255) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `internal`;
CREATE TABLE `internal` (
  `id` VARCHAR(64) NOT NULL,
  `kelompok` VARCHAR(255) NULL,
  `nama` VARCHAR(255) NULL,
  `pic` VARCHAR(255) NULL,
  `supervisor` VARCHAR(255) NULL,
  `siklus` VARCHAR(255) NULL,
  `tenggat` VARCHAR(255) NULL,
  `status` VARCHAR(255) NULL,
  `catatan` TEXT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `target`;
CREATE TABLE `target` (
  `periode` VARCHAR(64) NOT NULL,
  `laporan` VARCHAR(255) NULL,
  `pajak` VARCHAR(255) NULL,
  `catatan` TEXT NULL,
  `oleh` VARCHAR(255) NULL,
  `tgl` VARCHAR(255) NULL,
  PRIMARY KEY (`periode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `gcal`;
CREATE TABLE `gcal` (
  `id` VARCHAR(64) NOT NULL,
  `judul` VARCHAR(255) NULL,
  `mulai` VARCHAR(255) NULL,
  `selesai` VARCHAR(255) NULL,
  `lokasi` VARCHAR(255) NULL,
  `tamu` LONGTEXT NULL,
  `dariSims` TINYINT(1) NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `setelan`;
CREATE TABLE `setelan` (
  `kunci` VARCHAR(64) NOT NULL,
  `nilai` DECIMAL(18,2) NULL DEFAULT 0,
  PRIMARY KEY (`kunci`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `log`;
CREATE TABLE `log` (
  `id` VARCHAR(64) NOT NULL,
  `tgl` VARCHAR(255) NULL,
  `oleh` VARCHAR(255) NULL,
  `aksi` TEXT NULL,
  `ref` VARCHAR(255) NULL,
  `ip` VARCHAR(255) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `lm` ADD INDEX `idx_lm_klien` (`klien`), ADD INDEX `idx_lm_periode` (`periode`);
ALTER TABLE `tugas` ADD INDEX `idx_tugas_pic` (`pic`), ADD INDEX `idx_tugas_klien` (`klien`);
ALTER TABLE `patuh` ADD INDEX `idx_patuh_project` (`project`), ADD INDEX `idx_patuh_periode` (`periode`);
ALTER TABLE `project` ADD INDEX `idx_project_klien` (`klien`);
ALTER TABLE `lampiran` ADD INDEX `idx_lampiran_ref` (`ref`);
ALTER TABLE `log` ADD INDEX `idx_log_tgl` (`tgl`);

-- Data acuan: jenis kewajiban pajak
INSERT INTO `kewajiban` (`id`,`kode`,`nama`,`kategori`,`acuan`,`hari`,`akhirBulan`,`geser`,`dasar`,`perluSetor`,`aktif`) VALUES ('w1','PPH21-S','Setor PPh Pasal 21','Setor','berjalan',10,0,1,'PMK 242/2014 jo. perubahannya',1,1);
INSERT INTO `kewajiban` (`id`,`kode`,`nama`,`kategori`,`acuan`,`hari`,`akhirBulan`,`geser`,`dasar`,`perluSetor`,`aktif`) VALUES ('w2','PPH25-S','Setor PPh Pasal 25','Setor','berjalan',15,0,1,'PMK 242/2014',1,1);
INSERT INTO `kewajiban` (`id`,`kode`,`nama`,`kategori`,`acuan`,`hari`,`akhirBulan`,`geser`,`dasar`,`perluSetor`,`aktif`) VALUES ('w3','PPHU-S','Setor PPh Unifikasi','Setor','berjalan',15,0,1,'PMK 231/2019 jo. PER-24/2021',1,1);
INSERT INTO `kewajiban` (`id`,`kode`,`nama`,`kategori`,`acuan`,`hari`,`akhirBulan`,`geser`,`dasar`,`perluSetor`,`aktif`) VALUES ('w4','FPK-U','Upload Faktur Pajak Keluaran','Upload','sebelum',15,0,1,'PER-03/2022',0,1);
INSERT INTO `kewajiban` (`id`,`kode`,`nama`,`kategori`,`acuan`,`hari`,`akhirBulan`,`geser`,`dasar`,`perluSetor`,`aktif`) VALUES ('w5','PPH21-L','Lapor PPh Pasal 21','Lapor','sebelum',20,0,1,'UU KUP Pasal 3',1,1);
INSERT INTO `kewajiban` (`id`,`kode`,`nama`,`kategori`,`acuan`,`hari`,`akhirBulan`,`geser`,`dasar`,`perluSetor`,`aktif`) VALUES ('w6','PPHU-L','Lapor PPh Unifikasi','Lapor','sebelum',20,0,1,'PER-24/2021',1,1);
INSERT INTO `kewajiban` (`id`,`kode`,`nama`,`kategori`,`acuan`,`hari`,`akhirBulan`,`geser`,`dasar`,`perluSetor`,`aktif`) VALUES ('w7','PPN-S','Setor PPN','Setor','sebelum',0,1,1,'UU PPN Pasal 15A',1,1);
INSERT INTO `kewajiban` (`id`,`kode`,`nama`,`kategori`,`acuan`,`hari`,`akhirBulan`,`geser`,`dasar`,`perluSetor`,`aktif`) VALUES ('w8','PPN-L','Lapor PPN','Lapor','sebelum',0,1,1,'UU PPN Pasal 15A',1,1);

-- Data acuan: daftar akun standar
INSERT INTO `akun` (`id`,`kode`,`nama`,`arah`) VALUES ('a1','4-100','Penjualan barang','Masuk');
INSERT INTO `akun` (`id`,`kode`,`nama`,`arah`) VALUES ('a2','4-200','Pendapatan jasa','Masuk');
INSERT INTO `akun` (`id`,`kode`,`nama`,`arah`) VALUES ('a3','1-300','Pelunasan piutang usaha','Masuk');
INSERT INTO `akun` (`id`,`kode`,`nama`,`arah`) VALUES ('a4','2-200','Penerimaan pinjaman','Masuk');
INSERT INTO `akun` (`id`,`kode`,`nama`,`arah`) VALUES ('a5','5-100','Pembelian persediaan','Keluar');
INSERT INTO `akun` (`id`,`kode`,`nama`,`arah`) VALUES ('a6','6-100','Beban gaji dan upah','Keluar');
INSERT INTO `akun` (`id`,`kode`,`nama`,`arah`) VALUES ('a7','6-200','Beban operasional kantor','Keluar');
INSERT INTO `akun` (`id`,`kode`,`nama`,`arah`) VALUES ('a8','6-300','Pembayaran pajak','Keluar');
INSERT INTO `akun` (`id`,`kode`,`nama`,`arah`) VALUES ('a9','2-100','Pembayaran hutang','Keluar');
INSERT INTO `akun` (`id`,`kode`,`nama`,`arah`) VALUES ('a10','9-999','Belum teridentifikasi','Keluar');

-- Data acuan: contoh hari libur, sesuaikan tiap tahun
INSERT INTO `libur` (`id`,`tgl`,`ket`,`tahun`) VALUES ('h1','2026-01-01','Tahun Baru Masehi',2026);
INSERT INTO `libur` (`id`,`tgl`,`ket`,`tahun`) VALUES ('h2','2026-08-17','Hari Kemerdekaan RI',2026);
INSERT INTO `libur` (`id`,`tgl`,`ket`,`tahun`) VALUES ('h3','2026-12-25','Hari Raya Natal',2026);

-- Akun pertama, kata sandinya masih kosong.
-- Buka pasang.php sekali di peramban untuk menetapkan surel dan kata sandi Director.
INSERT INTO `pengguna` (`id`,`nama`,`email`,`peran`,`jabatan`,`aktif`,`masuk`,`kontrak`,`kontrakAkhir`,`cutiJatah`,`salt`,`sandi`,`wajibGanti`) VALUES
('u1','Director','director@sage.or.id','director','Director',1,'2026-08-20','Tetap','',12,'','',1);

-- Setelan awal
INSERT INTO `setelan` (`kunci`,`nilai`) VALUES ('periodeAktif','2026-08'),('periodeKepatuhan','2026-08');

SET FOREIGN_KEY_CHECKS = 1;
