-- Retail POS — subscription and entitlement layer.
-- Implements docs/superpowers/specs/2026-08-24-subscription-design.md
--
-- Run AFTER 01_schema.sql and BEFORE faker.php:
--   mysql -h 127.0.0.1 -P 3306 -u root -proot < database/05_subscription.sql
--
-- The triggers below refuse over-quota inserts into sy_outlet and sy_karyawan,
-- so anything that creates those rows must create a sy_subscription row first
-- (spec §6.5). faker.php does this.
--
-- Naming carve-outs, per spec §3 and now written into CLAUDE.md:
--   - SaaS-layer TABLE names are English; columns keep the Indonesian rule.
--   - rekap/detail applies outside pos_ because a payment is a real document:
--     the header is one renewal, the lines are "5 outlets x 12 x 50.000".

USE `retail`;

SET FOREIGN_KEY_CHECKS = 0;
DROP TRIGGER IF EXISTS `trg_kuota_karyawan_insert`;
DROP TRIGGER IF EXISTS `trg_kuota_karyawan_update`;
DROP TRIGGER IF EXISTS `trg_kuota_outlet_insert`;
DROP TRIGGER IF EXISTS `trg_kuota_outlet_update`;
DROP VIEW  IF EXISTS `subscription`;
DROP VIEW  IF EXISTS `payment`;
DROP TABLE IF EXISTS `sy_detail_payment`;
DROP TABLE IF EXISTS `sy_rekap_payment`;
DROP TABLE IF EXISTS `sy_subscription`;
DROP TABLE IF EXISTS `sy_pricing`;
SET FOREIGN_KEY_CHECKS = 1;


-- ============================================================
-- §5.1  Pricing — global, flat, and public.
-- ============================================================

CREATE TABLE `sy_pricing` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `jenis`           ENUM('outlet','karyawan') NOT NULL
                      COMMENT 'what is being charged for',
  `nama`            VARCHAR(50)     NOT NULL
                      COMMENT 'label shown on the landing page',
  `keterangan`      VARCHAR(255)    NULL DEFAULT NULL
                      COMMENT 'blurb shown under the label',
  `harga_per_bulan` DECIMAL(15,2)   NOT NULL
                      COMMENT 'monthly rate; a yearly term is this x 12',
  `sequence`        SMALLINT        NOT NULL DEFAULT 0
                      COMMENT 'display order only - same meaning as pos_level_harga.sequence',
  `is_active`       BOOLEAN         NOT NULL DEFAULT 1,
  `created_at`      TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP       NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pricing_jenis` (`jenis`),
  CONSTRAINT `ck_pricing_harga_positif` CHECK (`harga_per_bulan` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Global flat price list. No perusahaan_id: pricing is the same for everyone. The landing page and the renewal calculation read the same row, so they cannot disagree.';

INSERT INTO `sy_pricing` (`jenis`,`nama`,`keterangan`,`harga_per_bulan`,`sequence`) VALUES
  ('outlet',  'Outlet / cabang', 'Setiap outlet atau gudang yang aktif.',        50000.00, 1),
  ('karyawan','Staff',           'Setiap karyawan aktif yang dapat login.',       5000.00, 2);


-- ============================================================
-- §5.2  Current entitlement — one row per company.
--       The triggers below read THIS table. Keep it cheap.
-- ============================================================

CREATE TABLE `sy_subscription` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `perusahaan_id`  BIGINT UNSIGNED NOT NULL,
  `berlaku_sampai` DATE            NOT NULL
                     COMMENT 'INCLUSIVE last day of service. Locked when < CURDATE()',
  `kuota_outlet`   INT             NOT NULL
                     COMMENT 'how many ACTIVE outlets are paid for',
  `kuota_karyawan` INT             NOT NULL
                     COMMENT 'how many ACTIVE staff are paid for',
  `catatan`        VARCHAR(255)    NULL DEFAULT NULL
                     COMMENT 'why the date was moved by hand, e.g. transfer in flight',
  `diubah_oleh`    VARCHAR(100)    NULL DEFAULT NULL
                     COMMENT 'vendor staff name. NOT an FK - see spec open question 1',
  `created_at`     TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP       NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_subscription_perusahaan` (`perusahaan_id`),
  KEY `ix_subscription_berlaku` (`berlaku_sampai`),
  CONSTRAINT `fk_subscription_perusahaan` FOREIGN KEY (`perusahaan_id`)
    REFERENCES `sy_perusahaan` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `ck_subscription_kuota` CHECK (`kuota_outlet` >= 0 AND `kuota_karyawan` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Cache of the latest paid term. No status column: expired and over-quota are both derived, so neither can drift. Suspend by setting berlaku_sampai to a past date.';


-- ============================================================
-- §5.3  Payments — the truth that sy_subscription caches.
-- ============================================================

CREATE TABLE `sy_rekap_payment` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `perusahaan_id`  BIGINT UNSIGNED NOT NULL,
  `nomor`          VARCHAR(30)     NOT NULL,
  `tanggal`        DATE            NOT NULL,
  `periode_mulai`  DATE            NOT NULL,
  `periode_sampai` DATE            NOT NULL COMMENT 'inclusive',
  `total`          DECIMAL(15,2)   NOT NULL,
  `status`         ENUM('draft','lunas','batal') NOT NULL DEFAULT 'draft'
                     COMMENT 'only lunas extends the term. Cancel with batal - never DELETE',
  `metode`         VARCHAR(50)     NULL DEFAULT NULL COMMENT 'e.g. transfer BCA',
  `catatan`        VARCHAR(255)    NULL DEFAULT NULL,
  `dicatat_oleh`   VARCHAR(100)    NULL DEFAULT NULL
                     COMMENT 'vendor staff name. NOT an FK - see spec open question 1',
  `created_at`     TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP       NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payment_perusahaan_nomor` (`perusahaan_id`,`nomor`),
  KEY `ix_payment_perusahaan_tanggal` (`perusahaan_id`,`tanggal`),
  KEY `ix_payment_status` (`status`),
  CONSTRAINT `fk_payment_perusahaan` FOREIGN KEY (`perusahaan_id`)
    REFERENCES `sy_perusahaan` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `ck_payment_periode` CHECK (`periode_sampai` >= `periode_mulai`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='One row per renewal. Header of a real document, hence rekap/detail.';


CREATE TABLE `sy_detail_payment` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `perusahaan_id`   BIGINT UNSIGNED NOT NULL
                      COMMENT 'carried per CLAUDE.md §4 though derivable via rekap_id',
  `rekap_id`        BIGINT UNSIGNED NOT NULL,
  `jenis`           ENUM('outlet','karyawan','lainnya') NOT NULL,
  `keterangan`      VARCHAR(150)    NOT NULL,
  `jumlah`          INT             NOT NULL
                      COMMENT 'SEAT COUNT, not a stock quantity. Always whole',
  `bulan`           INT             NOT NULL COMMENT 'months covered, normally 12',
  `harga_per_bulan` DECIMAL(15,2)   NOT NULL
                      COMMENT 'SNAPSHOT of sy_pricing at the time. Never join to get this',
  `subtotal`        DECIMAL(15,2)   NOT NULL,
  `created_at`      TIMESTAMP       NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_detail_payment_rekap` (`rekap_id`),
  KEY `ix_detail_payment_perusahaan` (`perusahaan_id`),
  CONSTRAINT `fk_detail_payment_rekap` FOREIGN KEY (`rekap_id`)
    REFERENCES `sy_rekap_payment` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_detail_payment_perusahaan` FOREIGN KEY (`perusahaan_id`)
    REFERENCES `sy_perusahaan` (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `ck_detail_payment_positif` CHECK (`jumlah` > 0 AND `bulan` > 0),
  CONSTRAINT `ck_detail_payment_subtotal`
    CHECK (`subtotal` = `jumlah` * `bulan` * `harga_per_bulan`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Document lines. harga_per_bulan is snapshotted so raising prices never rewrites history - same principle as the sale line in master-item §7.';


-- ============================================================
-- §6.3  The quota triggers.
--
-- Application code checks first and produces a usable message; these exist so
-- the rule survives a forgotten check, a bulk import, someone in HeidiSQL, and
-- the planned Bun.js rewrite, which takes this database over whole.
--
-- Deactivation is NEVER blocked - that is what lets an over-quota company dig
-- itself out through natural turnover (§6.4).
-- ============================================================

DELIMITER //

CREATE TRIGGER `trg_kuota_karyawan_insert` BEFORE INSERT ON `sy_karyawan`
FOR EACH ROW
BEGIN
  DECLARE terpakai INT;
  DECLARE kuota INT;
  IF NEW.is_active = 1 THEN
    SELECT COUNT(*) INTO terpakai FROM `sy_karyawan`
      WHERE perusahaan_id = NEW.perusahaan_id AND is_active = 1;
    SELECT kuota_karyawan INTO kuota FROM `sy_subscription`
      WHERE perusahaan_id = NEW.perusahaan_id;
    IF kuota IS NULL OR terpakai >= kuota THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Kuota karyawan habis - tambah seat dulu';
    END IF;
  END IF;
END//

CREATE TRIGGER `trg_kuota_karyawan_update` BEFORE UPDATE ON `sy_karyawan`
FOR EACH ROW
BEGIN
  DECLARE terpakai INT;
  DECLARE kuota INT;
  -- only a genuine reactivation is gated
  IF OLD.is_active = 0 AND NEW.is_active = 1 THEN
    SELECT COUNT(*) INTO terpakai FROM `sy_karyawan`
      WHERE perusahaan_id = NEW.perusahaan_id AND is_active = 1;
    SELECT kuota_karyawan INTO kuota FROM `sy_subscription`
      WHERE perusahaan_id = NEW.perusahaan_id;
    IF kuota IS NULL OR terpakai >= kuota THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Kuota karyawan habis - tidak bisa aktifkan lagi';
    END IF;
  END IF;
END//

CREATE TRIGGER `trg_kuota_outlet_insert` BEFORE INSERT ON `sy_outlet`
FOR EACH ROW
BEGIN
  DECLARE terpakai INT;
  DECLARE kuota INT;
  IF NEW.is_active = 1 THEN
    SELECT COUNT(*) INTO terpakai FROM `sy_outlet`
      WHERE perusahaan_id = NEW.perusahaan_id AND is_active = 1;
    SELECT kuota_outlet INTO kuota FROM `sy_subscription`
      WHERE perusahaan_id = NEW.perusahaan_id;
    IF kuota IS NULL OR terpakai >= kuota THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Kuota outlet habis - tambah seat dulu';
    END IF;
  END IF;
END//

CREATE TRIGGER `trg_kuota_outlet_update` BEFORE UPDATE ON `sy_outlet`
FOR EACH ROW
BEGIN
  DECLARE terpakai INT;
  DECLARE kuota INT;
  IF OLD.is_active = 0 AND NEW.is_active = 1 THEN
    SELECT COUNT(*) INTO terpakai FROM `sy_outlet`
      WHERE perusahaan_id = NEW.perusahaan_id AND is_active = 1;
    SELECT kuota_outlet INTO kuota FROM `sy_subscription`
      WHERE perusahaan_id = NEW.perusahaan_id;
    IF kuota IS NULL OR terpakai >= kuota THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Kuota outlet habis - tidak bisa aktifkan lagi';
    END IF;
  END IF;
END//

DELIMITER ;


-- ============================================================
-- Reading views, in the style of 04_views.sql: names, not ids.
-- ============================================================

CREATE VIEW `subscription` AS
SELECT
  per.kode                       AS perusahaan_kode,
  per.nama                       AS perusahaan,
  s.berlaku_sampai,
  DATEDIFF(s.berlaku_sampai, CURDATE()) AS sisa_hari,
  CASE
    WHEN s.berlaku_sampai <  CURDATE() THEN 'TERKUNCI'
    WHEN DATEDIFF(s.berlaku_sampai, CURDATE()) <= 14 THEN 'segera habis'
    ELSE 'aktif'
  END                            AS status,
  s.kuota_outlet,
  o.terpakai                     AS outlet_terpakai,
  s.kuota_outlet - o.terpakai    AS outlet_sisa,
  s.kuota_karyawan,
  k.terpakai                     AS karyawan_terpakai,
  s.kuota_karyawan - k.terpakai  AS karyawan_sisa,
  IF(o.terpakai > s.kuota_outlet OR k.terpakai > s.kuota_karyawan,
     'OVER KUOTA - tidak bisa tambah', 'ok') AS kondisi_kuota,
  COALESCE(s.catatan, '-')       AS catatan,
  COALESCE(s.diubah_oleh, '-')   AS diubah_oleh,
  s.perusahaan_id
FROM sy_subscription s
JOIN sy_perusahaan per ON per.id = s.perusahaan_id
JOIN LATERAL (SELECT COUNT(*) AS terpakai FROM sy_outlet x
              WHERE x.perusahaan_id = s.perusahaan_id AND x.is_active = 1) o ON TRUE
JOIN LATERAL (SELECT COUNT(*) AS terpakai FROM sy_karyawan x
              WHERE x.perusahaan_id = s.perusahaan_id AND x.is_active = 1) k ON TRUE;


CREATE VIEW `payment` AS
SELECT
  r.id                           AS payment_id,
  per.kode                       AS perusahaan_kode,
  per.nama                       AS perusahaan,
  r.nomor,
  r.tanggal,
  CONCAT(r.periode_mulai, '  ..  ', r.periode_sampai) AS periode,
  r.status,
  COALESCE(r.metode, '-')        AS metode,
  r.total,
  CONCAT('Rp ', REPLACE(FORMAT(r.total, 0), ',', '.')) AS total_tampil,
  (SELECT GROUP_CONCAT(
      CONCAT(d.keterangan, ': ', d.jumlah, ' x ', d.bulan, ' bln x ',
             REPLACE(FORMAT(d.harga_per_bulan, 0), ',', '.'),
             ' = ', REPLACE(FORMAT(d.subtotal, 0), ',', '.'))
      ORDER BY d.id SEPARATOR '  |  ')
   FROM sy_detail_payment d WHERE d.rekap_id = r.id) AS rincian,
  COALESCE(r.dicatat_oleh, '-')  AS dicatat_oleh,
  COALESCE(r.catatan, '-')       AS catatan,
  r.perusahaan_id
FROM sy_rekap_payment r
JOIN sy_perusahaan per ON per.id = r.perusahaan_id;
