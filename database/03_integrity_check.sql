-- POS core assertions. Runs inside a transaction and rolls back, leaving no
-- rows behind. Safe to run against a database that already holds faker data.
--
-- Depends on 05_subscription.sql: creating an outlet or a staff member
-- requires the company to have a subscription row.
USE retail;
START TRANSACTION;

-- A distinct code: faker.php already owns ACME and KOPI, and this script is
-- meant to run alongside that data.
INSERT INTO sy_perusahaan (kode, nama) VALUES ('CHK','PT Uji Integritas');
SET @p := LAST_INSERT_ID();

-- Required before any outlet or staff row: the quota triggers in
-- 05_subscription.sql refuse inserts for a company with no subscription.
INSERT INTO sy_subscription (perusahaan_id, berlaku_sampai, kuota_outlet, kuota_karyawan)
VALUES (@p, DATE_ADD(CURDATE(), INTERVAL 1 YEAR), 10, 10);

INSERT IGNORE INTO pos_region (kode, nama) VALUES ('JW','Jawa'),('KLM','Kalimantan');
SET @r_jw := (SELECT id FROM pos_region WHERE kode='JW');
SET @r_klm := (SELECT id FROM pos_region WHERE kode='KLM');

INSERT IGNORE INTO pos_satuan (kode, nama) VALUES ('pcs','Pieces'),('box','Box');
SET @s_pcs := (SELECT id FROM pos_satuan WHERE kode='pcs');
SET @s_box := (SELECT id FROM pos_satuan WHERE kode='box');

INSERT INTO sy_outlet (perusahaan_id, kode, nama, region_id, tipe)
VALUES (@p,'O-JW','Outlet Bandung',@r_jw,'outlet'),
       (@p,'O-KL','Outlet Balikpapan',@r_klm,'outlet'),
       (@p,'FLC1','FLC Pusat',NULL,'gudang');
SET @o_jw := (SELECT id FROM sy_outlet WHERE perusahaan_id=@p AND kode='O-JW');
SET @o_kl := (SELECT id FROM sy_outlet WHERE perusahaan_id=@p AND kode='O-KL');

INSERT INTO sy_karyawan (perusahaan_id, nip, nama, outlet_id, peran)
VALUES (@p,'A001','Staff A',@o_jw,'staff'),
       (@p,'B002','Staff B',@o_jw,'staff'),
       (@p,'X009','Auditor X',NULL,'auditor');
SET @k_a := (SELECT id FROM sy_karyawan WHERE perusahaan_id=@p AND nip='A001');
SET @k_b := (SELECT id FROM sy_karyawan WHERE perusahaan_id=@p AND nip='B002');

INSERT INTO pos_jenis (perusahaan_id, nama) VALUES (@p,'Minuman');
INSERT INTO pos_merek (perusahaan_id, nama) VALUES (@p,'AquaX');
INSERT INTO pos_supplier (perusahaan_id, kode, nama) VALUES (@p,'PTX','PT X Distribusi');
SET @j := LAST_INSERT_ID();
SET @j := (SELECT id FROM pos_jenis WHERE perusahaan_id=@p);
SET @m := (SELECT id FROM pos_merek WHERE perusahaan_id=@p);
SET @sup := (SELECT id FROM pos_supplier WHERE perusahaan_id=@p);

-- decision 4: Box and Pcs are separate products
INSERT INTO pos_master_produk (perusahaan_id,kode,nama,satuan_id,jenis_id,merek_id,supplier_id,barcode,berat_gram,created_by_id)
VALUES (@p,'11001','Mineral Water 600ml (Pcs)',@s_pcs,@j,@m,@sup,'8991234567890',600,@k_a),
       (@p,'11001B','Mineral Water 600ml (Box)',@s_box,@j,@m,@sup,NULL,7200,@k_a),
       (@p,'11002','Mineral Water 1500ml (Pcs)',@s_pcs,@j,@m,@sup,NULL,1500,@k_a);
SET @pr_pcs := (SELECT id FROM pos_master_produk WHERE perusahaan_id=@p AND kode='11001');
SET @pr_box := (SELECT id FROM pos_master_produk WHERE perusahaan_id=@p AND kode='11001B');

SELECT '--- T1  two NULL barcodes coexist (deliberate asymmetry) ---' AS test;
SELECT COUNT(*) AS null_barcode_rows FROM pos_master_produk WHERE perusahaan_id=@p AND barcode IS NULL;

-- 5.4 konversi recipe: 1 Box -> 12 Pcs
INSERT INTO pos_master_konversi (perusahaan_id,produk_asal_id,jumlah_asal,produk_tujuan_id,jumlah_tujuan)
VALUES (@p,@pr_box,1,@pr_pcs,12);

-- 5.5 pricing
INSERT INTO pos_level_harga (perusahaan_id,nama,sequence,is_default)
VALUES (@p,'Retail',1,1),(@p,'GoFood',2,0),(@p,'Transfer Pabrik',3,0);
SET @l_ret := (SELECT id FROM pos_level_harga WHERE perusahaan_id=@p AND nama='Retail');
SET @l_gof := (SELECT id FROM pos_level_harga WHERE perusahaan_id=@p AND nama='GoFood');
SET @l_trf := (SELECT id FROM pos_level_harga WHERE perusahaan_id=@p AND nama='Transfer Pabrik');

INSERT INTO pos_harga_produk (perusahaan_id,produk_id,level_harga_id,region_id,harga) VALUES
  (@p,@pr_pcs,@l_ret,NULL,   9000.00),
  (@p,@pr_pcs,@l_gof,NULL,  13000.00),
  (@p,@pr_pcs,@l_trf,NULL,   5000.00),
  (@p,@pr_pcs,@l_ret,@r_klm,11000.00);

SELECT '--- T2  region_key collapses NULL to 0 ---' AS test;
SELECT h.harga, h.region_id, h.region_key, COALESCE(rg.kode,'(company-wide)') AS region
FROM pos_harga_produk h LEFT JOIN pos_region rg ON rg.id=h.region_id
WHERE h.produk_id=@pr_pcs ORDER BY h.level_harga_id, h.region_key;

SELECT '--- T3  resolution: Kalimantan outlet gets the override, Jawa falls back ---' AS test;
SELECT o.kode AS outlet, h.harga, COALESCE(rg.kode,'(company-wide)') AS matched_region
FROM sy_outlet o
JOIN pos_harga_produk h
  ON h.produk_id=@pr_pcs AND h.level_harga_id=@l_ret
 AND h.region_key = COALESCE(o.region_id,0)
LEFT JOIN pos_region rg ON rg.id=h.region_id
WHERE o.id IN (@o_jw,@o_kl)
UNION ALL
SELECT o.kode, h.harga, '(company-wide fallback)'
FROM sy_outlet o
JOIN pos_harga_produk h ON h.produk_id=@pr_pcs AND h.level_harga_id=@l_ret AND h.region_key=0
WHERE o.id IN (@o_jw,@o_kl)
  AND NOT EXISTS (SELECT 1 FROM pos_harga_produk h2
                  WHERE h2.produk_id=@pr_pcs AND h2.level_harga_id=@l_ret
                    AND h2.region_key=COALESCE(o.region_id,0));

-- 5.6 worked example: oversell then close it
SELECT '--- T4  ledger: retail -1 into negative, then masuk +1 ---' AS test;
INSERT INTO pos_stok_outlet (perusahaan_id,outlet_id,produk_id,stok)
VALUES (@p,@o_jw,@pr_pcs,-1) ON DUPLICATE KEY UPDATE stok=stok+VALUES(stok);
INSERT INTO pos_stok_mutasi (perusahaan_id,outlet_id,produk_id,jumlah,stok_akhir,tipe,karyawan_id,alasan_minus,catatan)
VALUES (@p,@o_jw,@pr_pcs,-1,
        (SELECT stok FROM pos_stok_outlet WHERE outlet_id=@o_jw AND produk_id=@pr_pcs),
        'retail',@k_b,'belum_input','supplier datang malam, barang ada di rak');

SELECT '--- T5  pending-receipt list (stok < 0) ---' AS test;
SELECT o.kode AS outlet, pp.kode AS produk, so.stok
FROM pos_stok_outlet so JOIN sy_outlet o ON o.id=so.outlet_id
JOIN pos_master_produk pp ON pp.id=so.produk_id
WHERE so.outlet_id=@o_jw AND so.stok < 0;

INSERT INTO pos_stok_outlet (perusahaan_id,outlet_id,produk_id,stok)
VALUES (@p,@o_jw,@pr_pcs,1) ON DUPLICATE KEY UPDATE stok=stok+VALUES(stok);
INSERT INTO pos_stok_mutasi (perusahaan_id,outlet_id,produk_id,jumlah,stok_akhir,tipe,karyawan_id,supplier_id,harga_pokok)
VALUES (@p,@o_jw,@pr_pcs,1,
        (SELECT stok FROM pos_stok_outlet WHERE outlet_id=@o_jw AND produk_id=@pr_pcs),
        'masuk',@k_a,@sup,5000.00);

SELECT '--- T6  drift check: SUM(jumlah) must equal cached stok ---' AS test;
SELECT so.stok AS cached, SUM(mu.jumlah) AS replayed,
       IF(so.stok = SUM(mu.jumlah),'MATCH','DRIFT') AS verdict
FROM pos_stok_outlet so
JOIN pos_stok_mutasi mu ON mu.outlet_id=so.outlet_id AND mu.produk_id=so.produk_id
WHERE so.outlet_id=@o_jw AND so.produk_id=@pr_pcs
GROUP BY so.stok;

SELECT '--- T7  konversi as two ledger rows sharing rekap_id ---' AS test;
INSERT INTO pos_stok_outlet (perusahaan_id,outlet_id,produk_id,stok) VALUES (@p,@o_jw,@pr_box,5)
  ON DUPLICATE KEY UPDATE stok=stok+VALUES(stok);
INSERT INTO pos_stok_outlet (perusahaan_id,outlet_id,produk_id,stok) VALUES (@p,@o_jw,@pr_box,-1)
  ON DUPLICATE KEY UPDATE stok=stok+VALUES(stok);
INSERT INTO pos_stok_outlet (perusahaan_id,outlet_id,produk_id,stok) VALUES (@p,@o_jw,@pr_pcs,12)
  ON DUPLICATE KEY UPDATE stok=stok+VALUES(stok);
INSERT INTO pos_stok_mutasi (perusahaan_id,outlet_id,produk_id,jumlah,stok_akhir,tipe,rekap_tipe,rekap_id,karyawan_id) VALUES
 (@p,@o_jw,@pr_box,-1,(SELECT stok FROM pos_stok_outlet WHERE outlet_id=@o_jw AND produk_id=@pr_box),'konversi','konversi',777,@k_a),
 (@p,@o_jw,@pr_pcs,12,(SELECT stok FROM pos_stok_outlet WHERE outlet_id=@o_jw AND produk_id=@pr_pcs),'konversi','konversi',777,@k_a);
SELECT pp.kode AS produk, mu.jumlah, mu.stok_akhir, mu.rekap_tipe, mu.rekap_id
FROM pos_stok_mutasi mu JOIN pos_master_produk pp ON pp.id=mu.produk_id
WHERE mu.perusahaan_id=@p AND mu.rekap_id=777 ORDER BY mu.id;

ROLLBACK;

SELECT '--- after ROLLBACK: the test company is gone, other data untouched ---' AS test;
SELECT (SELECT COUNT(*) FROM sy_perusahaan WHERE kode='CHK') AS perusahaan_uji_harus_0,
       (SELECT COUNT(*) FROM sy_perusahaan)                  AS perusahaan_lain,
       (SELECT COUNT(*) FROM pos_master_produk)              AS produk_lain,
       (SELECT COUNT(*) FROM pos_stok_mutasi)                AS mutasi_lain;
