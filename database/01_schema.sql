-- Retail POS — schema v1
-- Implements §5 of docs/superpowers/specs/2026-08-24-master-item-design.md
-- Scope: Master Item + the stock foundation. Document tables (§5.7) are
-- contract-only and belong to the next module — they are NOT created here.
--
-- Conventions enforced (CLAUDE.md):
--   lower_snake_case  |  Indonesian domain nouns, English structural terms
--   surrogate id BIGINT UNSIGNED on every table
--   foreign keys point at `id`, never at a natural string key
--   no ON UPDATE CASCADE anywhere
--   money is DECIMAL(15,2)  |  no column named `delta`

CREATE DATABASE IF NOT EXISTS `retail`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE `retail`;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `pos_stok_mutasi`;
DROP TABLE IF EXISTS `pos_stok_outlet`;
DROP TABLE IF EXISTS `pos_harga_produk`;
DROP TABLE IF EXISTS `pos_level_harga`;
DROP TABLE IF EXISTS `pos_master_konversi`;
DROP TABLE IF EXISTS `pos_master_produk`;
DROP TABLE IF EXISTS `pos_supplier`;
DROP TABLE IF EXISTS `pos_merek`;
DROP TABLE IF EXISTS `pos_jenis`;
DROP TABLE IF EXISTS `sy_karyawan`;
DROP TABLE IF EXISTS `sy_outlet`;
DROP TABLE IF EXISTS `pos_satuan`;
DROP TABLE IF EXISTS `pos_region`;
DROP TABLE IF EXISTS `sy_perusahaan`;
SET FOREIGN_KEY_CHECKS = 1;


-- ============================================================
-- 5.1  Organisation
-- ============================================================

CREATE TABLE `sy_perusahaan` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `kode`       VARCHAR(10)     NOT NULL,
  `nama`       VARCHAR(150)    NOT NULL,
  `is_active`  BOOLEAN         NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP       NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_perusahaan_kode` (`kode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Tenant. Every company-owned table carries perusahaan_id.';


-- Global lookup: shared by every company, no perusahaan_id by design.
CREATE TABLE `pos_region` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `kode`       VARCHAR(10)     NOT NULL,
  `nama`       VARCHAR(100)    NOT NULL,
  `created_at` TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP       NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_region_kode` (`kode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Global. Attaches to price and outlet, never to the product.';


-- Global lookup. One unit per product; Box and Pcs are separate products.
CREATE TABLE `pos_satuan` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `kode`       VARCHAR(10)     NOT NULL,
  `nama`       VARCHAR(50)     NOT NULL,
  `created_at` TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP       NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_satuan_kode` (`kode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Global unit of measure.';


CREATE TABLE `sy_outlet` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `perusahaan_id` BIGINT UNSIGNED NOT NULL,
  `kode`          VARCHAR(10)     NOT NULL,
  `nama`          VARCHAR(100)    NOT NULL,
  `region_id`     BIGINT UNSIGNED NULL DEFAULT NULL,
  `tipe`          ENUM('outlet','gudang') NOT NULL DEFAULT 'outlet' COMMENT 'outlet = sells to customers; gudang = warehouse/FLC that supplies outlets',
  `alamat`        TEXT            NULL DEFAULT NULL,
  `is_active`     BOOLEAN         NOT NULL DEFAULT 1,
  `created_at`    TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP       NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_outlet_perusahaan_kode` (`perusahaan_id`,`kode`),
  KEY `ix_outlet_perusahaan_region` (`perusahaan_id`,`region_id`),
  KEY `ix_outlet_region` (`region_id`),
  CONSTRAINT `fk_outlet_perusahaan` FOREIGN KEY (`perusahaan_id`)
    REFERENCES `sy_perusahaan` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_outlet_region` FOREIGN KEY (`region_id`)
    REFERENCES `pos_region` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='tipe replaces legacy FUNGSI x TIPE. An FLC is a gudang.';


CREATE TABLE `sy_karyawan` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `perusahaan_id` BIGINT UNSIGNED NOT NULL,
  `nip`           VARCHAR(20)     NOT NULL,
  `nama`          VARCHAR(150)    NOT NULL,
  `outlet_id`     BIGINT UNSIGNED NULL DEFAULT NULL,
  `peran`         ENUM('staff','supervisor','auditor','admin') NOT NULL DEFAULT 'staff' COMMENT 'only auditor and admin may write a penyesuaian (absolute stock correction)',
  `is_active`     BOOLEAN         NOT NULL DEFAULT 1,
  `created_at`    TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP       NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_karyawan_perusahaan_nip` (`perusahaan_id`,`nip`),
  KEY `ix_karyawan_outlet` (`outlet_id`),
  CONSTRAINT `fk_karyawan_perusahaan` FOREIGN KEY (`perusahaan_id`)
    REFERENCES `sy_perusahaan` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_karyawan_outlet` FOREIGN KEY (`outlet_id`)
    REFERENCES `sy_outlet` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='peran gates penyesuaian: auditor/admin only. See open question 4.';


-- ============================================================
-- 5.2  Per-company lookups
-- ============================================================

CREATE TABLE `pos_jenis` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `perusahaan_id` BIGINT UNSIGNED NOT NULL,
  `nama`          VARCHAR(100)    NOT NULL,
  `keterangan`    TEXT            NULL DEFAULT NULL,
  `created_at`    TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP       NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_jenis_perusahaan_nama` (`perusahaan_id`,`nama`),
  CONSTRAINT `fk_jenis_perusahaan` FOREIGN KEY (`perusahaan_id`)
    REFERENCES `sy_perusahaan` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `pos_merek` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `perusahaan_id` BIGINT UNSIGNED NOT NULL,
  `nama`          VARCHAR(100)    NOT NULL,
  `keterangan`    TEXT            NULL DEFAULT NULL,
  `created_at`    TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP       NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_merek_perusahaan_nama` (`perusahaan_id`,`nama`),
  CONSTRAINT `fk_merek_perusahaan` FOREIGN KEY (`perusahaan_id`)
    REFERENCES `sy_perusahaan` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `pos_supplier` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `perusahaan_id` BIGINT UNSIGNED NOT NULL,
  `kode`          VARCHAR(20)     NOT NULL,
  `nama`          VARCHAR(255)    NOT NULL,
  `telepon`       VARCHAR(30)     NULL DEFAULT NULL,
  `alamat`        TEXT            NULL DEFAULT NULL,
  `is_active`     BOOLEAN         NOT NULL DEFAULT 1,
  `created_at`    TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP       NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_supplier_perusahaan_kode` (`perusahaan_id`,`kode`),
  CONSTRAINT `fk_supplier_perusahaan` FOREIGN KEY (`perusahaan_id`)
    REFERENCES `sy_perusahaan` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Replaces both legacy supplier tables. Banking deferred.';


-- ============================================================
-- 5.3  Product master
-- ============================================================

CREATE TABLE `pos_master_produk` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `perusahaan_id`  BIGINT UNSIGNED NOT NULL,
  `kode`           VARCHAR(30)     NOT NULL,
  `nama`           VARCHAR(150)    NOT NULL,
  `satuan_id`      BIGINT UNSIGNED NOT NULL,
  `jenis_id`       BIGINT UNSIGNED NULL DEFAULT NULL,
  `merek_id`       BIGINT UNSIGNED NULL DEFAULT NULL,
  `supplier_id`    BIGINT UNSIGNED NULL DEFAULT NULL COMMENT 'default supplier only - who actually delivered is recorded per receipt',
  `barcode`        VARCHAR(50)     NULL DEFAULT NULL COMMENT 'NULL = this product has no barcode; many rows may be NULL',
  `berat_gram`     INT             NULL DEFAULT NULL,
  `deskripsi`      TEXT            NULL DEFAULT NULL,
  `gambar_url`     TEXT            NULL DEFAULT NULL,
  `status`         ENUM('aktif','tidak_aktif','diskontinu') NOT NULL DEFAULT 'aktif' COMMENT 'one axis only: aktif = sellable, tidak_aktif = hidden, diskontinu = never again',
  `created_by_id`  BIGINT UNSIGNED NULL DEFAULT NULL,
  `updated_by_id`  BIGINT UNSIGNED NULL DEFAULT NULL,
  `created_at`     TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP       NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_produk_perusahaan_kode`    (`perusahaan_id`,`kode`),
  UNIQUE KEY `uq_produk_perusahaan_barcode` (`perusahaan_id`,`barcode`),
  KEY `ix_produk_perusahaan_nama`   (`perusahaan_id`,`nama`),
  KEY `ix_produk_perusahaan_jenis`  (`perusahaan_id`,`jenis_id`),
  KEY `ix_produk_perusahaan_merek`  (`perusahaan_id`,`merek_id`),
  KEY `ix_produk_perusahaan_status` (`perusahaan_id`,`status`),
  KEY `ix_produk_satuan`     (`satuan_id`),
  KEY `ix_produk_jenis`      (`jenis_id`),
  KEY `ix_produk_merek`      (`merek_id`),
  KEY `ix_produk_supplier`   (`supplier_id`),
  KEY `ix_produk_created_by` (`created_by_id`),
  KEY `ix_produk_updated_by` (`updated_by_id`),
  CONSTRAINT `fk_produk_perusahaan` FOREIGN KEY (`perusahaan_id`)
    REFERENCES `sy_perusahaan` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_produk_satuan` FOREIGN KEY (`satuan_id`)
    REFERENCES `pos_satuan` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_produk_jenis` FOREIGN KEY (`jenis_id`)
    REFERENCES `pos_jenis` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_produk_merek` FOREIGN KEY (`merek_id`)
    REFERENCES `pos_merek` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_produk_supplier` FOREIGN KEY (`supplier_id`)
    REFERENCES `pos_supplier` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_produk_created_by` FOREIGN KEY (`created_by_id`)
    REFERENCES `sy_karyawan` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_produk_updated_by` FOREIGN KEY (`updated_by_id`)
    REFERENCES `sy_karyawan` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='NULL barcodes stay distinct under MySQL UNIQUE - deliberate.';


-- ============================================================
-- 5.4  Konversi recipe
-- ============================================================

CREATE TABLE `pos_master_konversi` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `perusahaan_id`    BIGINT UNSIGNED NOT NULL,
  `produk_asal_id`   BIGINT UNSIGNED NOT NULL,
  `jumlah_asal`      INT             NOT NULL COMMENT 'how many of produk_asal are consumed, e.g. 1 Box',
  `produk_tujuan_id` BIGINT UNSIGNED NOT NULL,
  `jumlah_tujuan`    INT             NOT NULL COMMENT 'how many of produk_tujuan are produced, e.g. 12 Pcs',
  `is_active`        BOOLEAN         NOT NULL DEFAULT 1,
  `created_at`       TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP       NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_konversi_arah` (`perusahaan_id`,`produk_asal_id`,`produk_tujuan_id`),
  KEY `ix_konversi_asal`   (`produk_asal_id`),
  KEY `ix_konversi_tujuan` (`produk_tujuan_id`),
  CONSTRAINT `fk_konversi_perusahaan` FOREIGN KEY (`perusahaan_id`)
    REFERENCES `sy_perusahaan` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_konversi_asal` FOREIGN KEY (`produk_asal_id`)
    REFERENCES `pos_master_produk` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_konversi_tujuan` FOREIGN KEY (`produk_tujuan_id`)
    REFERENCES `pos_master_produk` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `ck_konversi_jumlah_positif` CHECK (`jumlah_asal` > 0 AND `jumlah_tujuan` > 0),
  CONSTRAINT `ck_konversi_beda_produk`    CHECK (`produk_asal_id` <> `produk_tujuan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Directional. Re-packing back is a second row. Same-tenant check is in app code.';


-- ============================================================
-- 5.5  Pricing
-- ============================================================

CREATE TABLE `pos_level_harga` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `perusahaan_id` BIGINT UNSIGNED NOT NULL,
  `nama`          VARCHAR(50)     NOT NULL COMMENT 'THE LEVEL ITSELF - Retail, GoFood, Transfer Pabrik. This is what a price is keyed by',
  `sequence`      SMALLINT        NOT NULL DEFAULT 0 COMMENT 'display order in the UI only - NOT the level, NOT a precedence rank',
  `is_default`    BOOLEAN         NOT NULL DEFAULT 0 COMMENT 'the level a normal counter sale uses when none is chosen',
  `created_at`    TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP       NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_level_perusahaan_nama` (`perusahaan_id`,`nama`),
  CONSTRAINT `fk_level_perusahaan` FOREIGN KEY (`perusahaan_id`)
    REFERENCES `sy_perusahaan` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Levels are named per company: Retail / GoFood / Transfer Pabrik.';


CREATE TABLE `pos_harga_produk` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `perusahaan_id`  BIGINT UNSIGNED NOT NULL,
  `produk_id`      BIGINT UNSIGNED NOT NULL,
  `level_harga_id` BIGINT UNSIGNED NOT NULL,
  `region_id`      BIGINT UNSIGNED NULL DEFAULT NULL COMMENT 'NULL = company-wide',
  `region_key`     BIGINT UNSIGNED AS (COALESCE(`region_id`, 0)) STORED,
  `harga`          DECIMAL(15,2)   NOT NULL,
  `updated_by_id`  BIGINT UNSIGNED NULL DEFAULT NULL,
  `created_at`     TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP       NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_harga_produk_level_region` (`produk_id`,`level_harga_id`,`region_key`),
  KEY `ix_harga_perusahaan_produk` (`perusahaan_id`,`produk_id`),
  KEY `ix_harga_level`      (`level_harga_id`),
  KEY `ix_harga_region`     (`region_id`),
  KEY `ix_harga_updated_by` (`updated_by_id`),
  CONSTRAINT `fk_harga_perusahaan` FOREIGN KEY (`perusahaan_id`)
    REFERENCES `sy_perusahaan` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_harga_produk` FOREIGN KEY (`produk_id`)
    REFERENCES `pos_master_produk` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_harga_level` FOREIGN KEY (`level_harga_id`)
    REFERENCES `pos_level_harga` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_harga_region` FOREIGN KEY (`region_id`)
    REFERENCES `pos_region` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_harga_updated_by` FOREIGN KEY (`updated_by_id`)
    REFERENCES `sy_karyawan` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='region_key collapses NULL to 0 so one company-wide price per level is enforced.';


-- ============================================================
-- 5.6  Stock
-- ============================================================

CREATE TABLE `pos_stok_outlet` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `perusahaan_id` BIGINT UNSIGNED NOT NULL,
  `outlet_id`     BIGINT UNSIGNED NOT NULL,
  `produk_id`     BIGINT UNSIGNED NOT NULL,
  `stok`          INT             NOT NULL DEFAULT 0 COMMENT 'cached balance; equals SUM(jumlah) of this pair in pos_stok_mutasi. May be negative',
  `created_at`    TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP       NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_stok_outlet_produk` (`outlet_id`,`produk_id`),
  KEY `ix_stok_perusahaan_produk` (`perusahaan_id`,`produk_id`),
  KEY `ix_stok_outlet_saldo`      (`outlet_id`,`stok`),
  KEY `ix_stok_produk`            (`produk_id`),
  CONSTRAINT `fk_stok_perusahaan` FOREIGN KEY (`perusahaan_id`)
    REFERENCES `sy_perusahaan` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_stok_outlet` FOREIGN KEY (`outlet_id`)
    REFERENCES `sy_outlet` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_stok_produk` FOREIGN KEY (`produk_id`)
    REFERENCES `pos_master_produk` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Cached balance. The unique key is the row lock for concurrent cashiers.';


CREATE TABLE `pos_stok_mutasi` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `perusahaan_id`    BIGINT UNSIGNED NOT NULL,
  `outlet_id`        BIGINT UNSIGNED NOT NULL,
  `produk_id`        BIGINT UNSIGNED NOT NULL,
  `jumlah`           INT             NOT NULL COMMENT 'signed change; never called delta',
  `stok_akhir`       INT             NOT NULL COMMENT 'balance after this row',
  `tipe`             ENUM('masuk','keluar','transfer','konversi','retail','retur','penyesuaian') NOT NULL,
  `rekap_tipe`       VARCHAR(20)     NULL DEFAULT NULL COMMENT 'which document family caused this: masuk, keluar, transfer, konversi, retail',
  `rekap_id`         BIGINT UNSIGNED NULL DEFAULT NULL COMMENT 'header row id in that document. Soft link - no FK, the document tables do not exist yet',
  `supplier_id`      BIGINT UNSIGNED NULL DEFAULT NULL COMMENT 'masuk only',
  `harga_pokok`      DECIMAL(15,2)   NULL DEFAULT NULL COMMENT 'masuk only: real unit cost',
  `outlet_lawan_id`  BIGINT UNSIGNED NULL DEFAULT NULL COMMENT 'transfer: the other end',
  `alasan_minus`     ENUM('belum_input','salah_hitung','retur_belum_proses','lainnya') NULL DEFAULT NULL COMMENT 'required when a retail sale drives the balance below zero',
  `catatan`          VARCHAR(255)    NULL DEFAULT NULL,
  `karyawan_id`      BIGINT UNSIGNED NOT NULL,
  `created_at`       TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_mutasi_outlet_produk_id` (`outlet_id`,`produk_id`,`id`),
  KEY `ix_mutasi_perusahaan_waktu` (`perusahaan_id`,`created_at`),
  KEY `ix_mutasi_rekap`            (`rekap_tipe`,`rekap_id`),
  KEY `ix_mutasi_produk`   (`produk_id`),
  KEY `ix_mutasi_karyawan` (`karyawan_id`),
  KEY `ix_mutasi_supplier` (`supplier_id`),
  KEY `ix_mutasi_lawan`    (`outlet_lawan_id`),
  CONSTRAINT `fk_mutasi_perusahaan` FOREIGN KEY (`perusahaan_id`)
    REFERENCES `sy_perusahaan` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_mutasi_outlet` FOREIGN KEY (`outlet_id`)
    REFERENCES `sy_outlet` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_mutasi_produk` FOREIGN KEY (`produk_id`)
    REFERENCES `pos_master_produk` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_mutasi_supplier` FOREIGN KEY (`supplier_id`)
    REFERENCES `pos_supplier` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_mutasi_outlet_lawan` FOREIGN KEY (`outlet_lawan_id`)
    REFERENCES `sy_outlet` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_mutasi_karyawan` FOREIGN KEY (`karyawan_id`)
    REFERENCES `sy_karyawan` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Append-only ledger, the truth. Direction is the sign of jumlah, not the tipe.';
