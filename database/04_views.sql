-- Retail POS — reading views.
--
-- Run after 01_schema.sql. These are read-only helpers for browsing the data
-- by eye: every `*_id` is resolved to the name it points at, so you can read a
-- row without joining anything yourself.
--
--   mysql -h 127.0.0.1 -P 3306 -u root -proot < database/04_views.sql
--
-- They are NOT an application layer. Application queries should still hit the
-- tables directly and select only the columns they need — a view that joins
-- six tables is wasteful when the caller wanted two of them.
--
-- Naming: no prefix. Views take the bare subject name (`produk`, `harga`,
-- `stok`, `mutasi`); tables keep their `pos_` / `sy_` prefixes. HeidiSQL and
-- information_schema already separate the two, so a prefix would only add
-- noise. Views are not covered by CLAUDE.md — this needs blessing before it
-- spreads.
--
-- Two of these are easy to confuse, so:
--   harga         one row per PRICE   (produk x level x region) - filter this
--   produk_harga  one row per PRODUCT (its whole price list as one string)

USE `retail`;

DROP VIEW IF EXISTS `produk`;
DROP VIEW IF EXISTS `produk_harga`;
DROP VIEW IF EXISTS `harga`;
DROP VIEW IF EXISTS `konversi`;
DROP VIEW IF EXISTS `stok`;
DROP VIEW IF EXISTS `mutasi`;
DROP VIEW IF EXISTS `pending_terima`;
DROP VIEW IF EXISTS `ringkasan_produk`;


-- ============================================================
-- produk — the master item with every id spelled out.
--            This is the one to start with.
-- ============================================================
CREATE VIEW `produk` AS
SELECT
  p.id                                   AS produk_id,
  per.nama                               AS perusahaan,
  p.kode,
  p.nama,
  sat.nama                               AS satuan,
  COALESCE(j.nama,  '(tanpa jenis)')     AS jenis,
  COALESCE(mr.nama, '(tanpa merek)')     AS merek,
  COALESCE(sup.nama,'(tanpa supplier)')  AS supplier_default,
  COALESCE(p.barcode, '(tanpa barcode)') AS barcode,
  CASE
    WHEN p.berat_gram IS NULL      THEN '(tidak diisi)'
    WHEN p.berat_gram >= 1000      THEN CONCAT(TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM FORMAT(p.berat_gram/1000, 2))), ' kg')
    ELSE CONCAT(p.berat_gram, ' g')
  END                                    AS berat,
  p.status,
  p.deskripsi,
  COALESCE(kc.nama, '(tidak tercatat)')  AS dibuat_oleh,
  COALESCE(ku.nama, '(belum diubah)')    AS diubah_oleh,
  p.created_at                           AS dibuat,
  p.updated_at                           AS diubah,
  p.perusahaan_id
FROM pos_master_produk p
JOIN sy_perusahaan  per ON per.id = p.perusahaan_id
JOIN pos_satuan     sat ON sat.id = p.satuan_id
LEFT JOIN pos_jenis    j   ON j.id   = p.jenis_id
LEFT JOIN pos_merek    mr  ON mr.id  = p.merek_id
LEFT JOIN pos_supplier sup ON sup.id = p.supplier_id
LEFT JOIN sy_karyawan  kc  ON kc.id  = p.created_by_id
LEFT JOIN sy_karyawan  ku  ON ku.id  = p.updated_by_id;


-- ============================================================
-- harga — one row per price. Long form, easy to filter.
-- ============================================================
CREATE VIEW `harga` AS
SELECT
  h.id                                     AS harga_id,
  per.nama                                 AS perusahaan,
  p.kode                                   AS produk_kode,
  p.nama                                   AS produk_nama,
  sat.nama                                 AS satuan,
  l.nama                                   AS level_harga,
  l.sequence                               AS urutan_tampil,
  IF(l.is_default, 'ya', 'tidak')          AS level_bawaan,
  COALESCE(rg.nama, 'semua region')        AS berlaku_di,
  IF(h.region_id IS NULL, 'company-wide', 'khusus region') AS cakupan,
  h.harga,
  CONCAT('Rp ', REPLACE(FORMAT(h.harga, 0), ',', '.')) AS harga_tampil,
  COALESCE(ku.nama, '(tidak tercatat)')    AS diubah_oleh,
  h.updated_at                             AS diubah,
  h.perusahaan_id, h.produk_id, h.region_key
FROM pos_harga_produk h
JOIN sy_perusahaan   per ON per.id = h.perusahaan_id
JOIN pos_master_produk p ON p.id   = h.produk_id
JOIN pos_satuan      sat ON sat.id = p.satuan_id
JOIN pos_level_harga l   ON l.id   = h.level_harga_id
LEFT JOIN pos_region rg  ON rg.id  = h.region_id
LEFT JOIN sy_karyawan ku ON ku.id  = h.updated_by_id;


-- ============================================================
-- produk_harga — one row per product, its whole price list as text.
--                  The fastest way to see what pricing looks like.
-- ============================================================
CREATE VIEW `produk_harga` AS
SELECT
  p.id                       AS produk_id,
  per.nama                   AS perusahaan,
  p.kode,
  p.nama,
  sat.nama                   AS satuan,
  p.status,
  COUNT(h.id)                AS jumlah_harga,
  GROUP_CONCAT(
    CONCAT(l.nama,
           IF(h.region_id IS NULL, '', CONCAT(' [', rg.kode, ']')),
           ': ', REPLACE(FORMAT(h.harga, 0), ',', '.'))
    ORDER BY l.sequence, h.region_key
    SEPARATOR '  |  ')       AS daftar_harga,
  p.perusahaan_id
FROM pos_master_produk p
JOIN sy_perusahaan per ON per.id = p.perusahaan_id
JOIN pos_satuan    sat ON sat.id = p.satuan_id
LEFT JOIN pos_harga_produk h ON h.produk_id = p.id
LEFT JOIN pos_level_harga  l ON l.id = h.level_harga_id
LEFT JOIN pos_region      rg ON rg.id = h.region_id
GROUP BY p.id, per.nama, p.kode, p.nama, sat.nama, p.status, p.perusahaan_id;


-- ============================================================
-- konversi — repacking recipes as a sentence.
-- ============================================================
CREATE VIEW `konversi` AS
SELECT
  k.id                       AS konversi_id,
  per.nama                   AS perusahaan,
  -- kode and merek are in the sentence on purpose: two brands of the same
  -- bottle have identical `nama`, and without them the recipes read as
  -- duplicates of each other.
  CONCAT(k.jumlah_asal, ' ', sa.nama, ' ', pa.kode, ' ', pa.nama,
         '  ->  ', k.jumlah_tujuan, ' ', st.nama, ' ', pt.kode, ' ', pt.nama,
         '   [', COALESCE(mr.nama, 'tanpa merek'), ']') AS resep,
  COALESCE(mr.nama, '(tanpa merek)') AS merek,
  pa.kode                    AS dari_kode,
  pa.nama                    AS dari_produk,
  k.jumlah_asal              AS dari_jumlah,
  sa.nama                    AS dari_satuan,
  pt.kode                    AS jadi_kode,
  pt.nama                    AS jadi_produk,
  k.jumlah_tujuan            AS jadi_jumlah,
  st.nama                    AS jadi_satuan,
  IF(k.is_active, 'aktif', 'nonaktif') AS status,
  k.perusahaan_id
FROM pos_master_konversi k
JOIN sy_perusahaan per ON per.id = k.perusahaan_id
JOIN pos_master_produk pa ON pa.id = k.produk_asal_id
JOIN pos_master_produk pt ON pt.id = k.produk_tujuan_id
JOIN pos_satuan sa ON sa.id = pa.satuan_id
JOIN pos_satuan st ON st.id = pt.satuan_id
LEFT JOIN pos_merek mr ON mr.id = pa.merek_id;


-- ============================================================
-- stok — cached balances, readable.
-- ============================================================
CREATE VIEW `stok` AS
SELECT
  so.id                      AS stok_id,
  per.nama                   AS perusahaan,
  o.kode                     AS outlet_kode,
  o.nama                     AS outlet,
  o.tipe                     AS outlet_tipe,
  COALESCE(rg.nama, '(tanpa region)') AS region,
  p.kode                     AS produk_kode,
  p.nama                     AS produk,
  sat.nama                   AS satuan,
  so.stok,
  CASE WHEN so.stok < 0 THEN 'MINUS - menunggu barang masuk'
       WHEN so.stok = 0 THEN 'kosong'
       WHEN so.stok < 10 THEN 'menipis'
       ELSE 'aman' END       AS kondisi,
  so.updated_at              AS diubah,
  so.perusahaan_id, so.outlet_id, so.produk_id
FROM pos_stok_outlet so
JOIN sy_perusahaan per ON per.id = so.perusahaan_id
JOIN sy_outlet       o ON o.id   = so.outlet_id
JOIN pos_master_produk p ON p.id = so.produk_id
JOIN pos_satuan    sat ON sat.id = p.satuan_id
LEFT JOIN pos_region rg ON rg.id = o.region_id;


-- ============================================================
-- mutasi — the ledger in plain language.
-- ============================================================
CREATE VIEW `mutasi` AS
SELECT
  mu.id                      AS mutasi_id,
  per.nama                   AS perusahaan,
  mu.created_at              AS waktu,
  o.kode                     AS outlet_kode,
  o.nama                     AS outlet,
  p.kode                     AS produk_kode,
  p.nama                     AS produk,
  sat.nama                   AS satuan,
  mu.tipe,
  IF(mu.jumlah > 0, 'masuk', 'keluar') AS arah,
  mu.jumlah,
  CONCAT(IF(mu.jumlah > 0, '+', ''), mu.jumlah) AS jumlah_tampil,
  mu.stok_akhir              AS sisa_setelah_ini,
  CONCAT(k.nama, ' (', k.peran, ')') AS oleh,
  COALESCE(sup.nama, '-')    AS supplier,
  mu.harga_pokok             AS harga_pokok,
  COALESCE(ol.nama, '-')     AS outlet_lawan,
  COALESCE(mu.alasan_minus, '-') AS alasan_minus,
  COALESCE(mu.catatan, '-')  AS catatan,
  IF(mu.rekap_id IS NULL, '-', CONCAT(mu.rekap_tipe, ' #', mu.rekap_id)) AS dokumen,
  mu.perusahaan_id, mu.outlet_id, mu.produk_id, mu.rekap_tipe, mu.rekap_id
FROM pos_stok_mutasi mu
JOIN sy_perusahaan per ON per.id = mu.perusahaan_id
JOIN sy_outlet       o ON o.id   = mu.outlet_id
JOIN pos_master_produk p ON p.id = mu.produk_id
JOIN pos_satuan    sat ON sat.id = p.satuan_id
JOIN sy_karyawan     k ON k.id   = mu.karyawan_id
LEFT JOIN pos_supplier sup ON sup.id = mu.supplier_id
LEFT JOIN sy_outlet     ol ON ol.id  = mu.outlet_lawan_id;


-- ============================================================
-- pending_terima — what was sold before its receipt was filed.
--                    Just `stok < 0`, with the story attached.
-- ============================================================
CREATE VIEW `pending_terima` AS
SELECT
  per.nama                   AS perusahaan,
  o.kode                     AS outlet_kode,
  o.nama                     AS outlet,
  p.kode                     AS produk_kode,
  p.nama                     AS produk,
  sat.nama                   AS satuan,
  so.stok                    AS kurang,
  last_mu.alasan_minus,
  last_mu.catatan,
  last_mu.oleh,
  last_mu.waktu              AS terakhir_minus,
  so.perusahaan_id, so.outlet_id, so.produk_id
FROM pos_stok_outlet so
JOIN sy_perusahaan per ON per.id = so.perusahaan_id
JOIN sy_outlet       o ON o.id   = so.outlet_id
JOIN pos_master_produk p ON p.id = so.produk_id
JOIN pos_satuan    sat ON sat.id = p.satuan_id
LEFT JOIN LATERAL (
  SELECT mu.alasan_minus, mu.catatan, mu.created_at AS waktu,
         CONCAT(k.nama, ' (', k.peran, ')') AS oleh
  FROM pos_stok_mutasi mu
  JOIN sy_karyawan k ON k.id = mu.karyawan_id
  WHERE mu.outlet_id = so.outlet_id AND mu.produk_id = so.produk_id
    AND mu.alasan_minus IS NOT NULL
  ORDER BY mu.created_at DESC, mu.id DESC
  LIMIT 1
) AS last_mu ON TRUE
WHERE so.stok < 0;


-- ============================================================
-- ringkasan_produk — one row per product: pricing, spread, movement.
--                      The "where does this product stand" view.
-- ============================================================
CREATE VIEW `ringkasan_produk` AS
SELECT
  p.id                       AS produk_id,
  per.nama                   AS perusahaan,
  p.kode,
  p.nama,
  sat.nama                   AS satuan,
  COALESCE(j.nama, '-')      AS jenis,
  COALESCE(mr.nama, '-')     AS merek,
  p.status,
  (SELECT COUNT(*) FROM pos_harga_produk h WHERE h.produk_id = p.id)                       AS jumlah_harga,
  (SELECT COUNT(*) FROM pos_harga_produk h WHERE h.produk_id = p.id AND h.region_id IS NOT NULL) AS harga_khusus_region,
  (SELECT COUNT(*) FROM pos_stok_outlet so WHERE so.produk_id = p.id)                      AS jumlah_outlet,
  COALESCE((SELECT SUM(so.stok) FROM pos_stok_outlet so WHERE so.produk_id = p.id), 0)     AS total_stok,
  COALESCE((SELECT COUNT(*) FROM pos_stok_outlet so WHERE so.produk_id = p.id AND so.stok < 0), 0) AS outlet_minus,
  (SELECT COUNT(*) FROM pos_stok_mutasi mu WHERE mu.produk_id = p.id)                      AS jumlah_mutasi,
  (SELECT MAX(mu.created_at) FROM pos_stok_mutasi mu WHERE mu.produk_id = p.id)            AS mutasi_terakhir,
  p.perusahaan_id
FROM pos_master_produk p
JOIN sy_perusahaan per ON per.id = p.perusahaan_id
JOIN pos_satuan    sat ON sat.id = p.satuan_id
LEFT JOIN pos_jenis  j ON j.id   = p.jenis_id
LEFT JOIN pos_merek mr ON mr.id  = p.merek_id;
