-- Retail POS — OPTIONAL demo data.
-- NOT applied by default. The `retail` database is intentionally empty after
-- 01_schema.sql so real data can be loaded without colliding with fixtures.
--
-- Load it only if you want something to click around in:
--   mysql -h 127.0.0.1 -P 3306 -u root -proot < database/02_seed_demo.sql
--
-- Remove it again with:
--   mysql -h 127.0.0.1 -P 3306 -u root -proot -e "DROP DATABASE retail;" \
--     && mysql ... < database/01_schema.sql

USE `retail`;

START TRANSACTION;

-- Tenant ---------------------------------------------------------------
INSERT INTO `sy_perusahaan` (`kode`,`nama`) VALUES ('ACME','PT Acme Retail');
SET @p := LAST_INSERT_ID();

-- Global lookups -------------------------------------------------------
INSERT INTO `pos_region` (`kode`,`nama`) VALUES
  ('JW','Jawa'), ('KLM','Kalimantan'), ('SMT','Sumatra');
SET @r_jw  := (SELECT id FROM pos_region WHERE kode='JW');
SET @r_klm := (SELECT id FROM pos_region WHERE kode='KLM');

INSERT INTO `pos_satuan` (`kode`,`nama`) VALUES
  ('pcs','Pieces'), ('box','Box'), ('kg','Kilogram');
SET @s_pcs := (SELECT id FROM pos_satuan WHERE kode='pcs');
SET @s_box := (SELECT id FROM pos_satuan WHERE kode='box');

-- Outlets --------------------------------------------------------------
INSERT INTO `sy_outlet` (`perusahaan_id`,`kode`,`nama`,`region_id`,`tipe`) VALUES
  (@p,'O-JW','Outlet Bandung',    @r_jw, 'outlet'),
  (@p,'O-KL','Outlet Balikpapan', @r_klm,'outlet'),
  (@p,'FLC1','FLC Pusat',         @r_jw, 'gudang');
SET @o_jw := (SELECT id FROM sy_outlet WHERE perusahaan_id=@p AND kode='O-JW');
SET @o_kl := (SELECT id FROM sy_outlet WHERE perusahaan_id=@p AND kode='O-KL');

-- Employees ------------------------------------------------------------
INSERT INTO `sy_karyawan` (`perusahaan_id`,`nip`,`nama`,`outlet_id`,`peran`) VALUES
  (@p,'A001','Staff A',   @o_jw, 'staff'),
  (@p,'B002','Staff B',   @o_jw, 'staff'),
  (@p,'X009','Auditor X', NULL,  'auditor');
SET @k_a := (SELECT id FROM sy_karyawan WHERE perusahaan_id=@p AND nip='A001');
SET @k_b := (SELECT id FROM sy_karyawan WHERE perusahaan_id=@p AND nip='B002');

-- Per-company lookups --------------------------------------------------
INSERT INTO `pos_jenis`    (`perusahaan_id`,`nama`) VALUES (@p,'Minuman'), (@p,'Snack');
INSERT INTO `pos_merek`    (`perusahaan_id`,`nama`) VALUES (@p,'AquaX'),   (@p,'Krispi');
INSERT INTO `pos_supplier` (`perusahaan_id`,`kode`,`nama`,`telepon`) VALUES
  (@p,'PTX','PT X Distribusi','021-5550100');
SET @j   := (SELECT id FROM pos_jenis    WHERE perusahaan_id=@p AND nama='Minuman');
SET @m   := (SELECT id FROM pos_merek    WHERE perusahaan_id=@p AND nama='AquaX');
SET @sup := (SELECT id FROM pos_supplier WHERE perusahaan_id=@p AND kode='PTX');

-- Products. Decision 4: Box and Pcs are SEPARATE products. --------------
INSERT INTO `pos_master_produk`
  (`perusahaan_id`,`kode`,`nama`,`satuan_id`,`jenis_id`,`merek_id`,`supplier_id`,`barcode`,`berat_gram`,`created_by_id`) VALUES
  (@p,'11001', 'Mineral Water 600ml (Pcs)', @s_pcs,@j,@m,@sup,'8991234567890', 600,@k_a),
  (@p,'11001B','Mineral Water 600ml (Box)', @s_box,@j,@m,@sup, NULL,           7200,@k_a),
  (@p,'11002', 'Mineral Water 1500ml (Pcs)',@s_pcs,@j,@m,@sup, NULL,           1500,@k_a);
SET @pr_pcs := (SELECT id FROM pos_master_produk WHERE perusahaan_id=@p AND kode='11001');
SET @pr_box := (SELECT id FROM pos_master_produk WHERE perusahaan_id=@p AND kode='11001B');

-- Konversi recipe: 1 Box -> 12 Pcs. Directional; the reverse is another row.
INSERT INTO `pos_master_konversi`
  (`perusahaan_id`,`produk_asal_id`,`jumlah_asal`,`produk_tujuan_id`,`jumlah_tujuan`) VALUES
  (@p,@pr_box,1,@pr_pcs,12);

-- Pricing: the worked example from spec §5.5 ----------------------------
INSERT INTO `pos_level_harga` (`perusahaan_id`,`nama`,`sequence`,`is_default`) VALUES
  (@p,'Retail',1,1), (@p,'GoFood',2,0), (@p,'Transfer Pabrik',3,0);
SET @l_ret := (SELECT id FROM pos_level_harga WHERE perusahaan_id=@p AND nama='Retail');
SET @l_gof := (SELECT id FROM pos_level_harga WHERE perusahaan_id=@p AND nama='GoFood');
SET @l_trf := (SELECT id FROM pos_level_harga WHERE perusahaan_id=@p AND nama='Transfer Pabrik');

INSERT INTO `pos_harga_produk` (`perusahaan_id`,`produk_id`,`level_harga_id`,`region_id`,`harga`) VALUES
  (@p,@pr_pcs,@l_ret,NULL,    9000.00),   -- company-wide retail
  (@p,@pr_pcs,@l_gof,NULL,   13000.00),   -- absorbs platform commission
  (@p,@pr_pcs,@l_trf,NULL,    5000.00),   -- factory -> outlet
  (@p,@pr_pcs,@l_ret,@r_klm, 11000.00);   -- Kalimantan overrides retail

-- Stock: spec §5.6 worked example ---------------------------------------
-- Night delivery not recorded. Morning: Staff B sells the one on the rack.
INSERT INTO `pos_stok_outlet` (`perusahaan_id`,`outlet_id`,`produk_id`,`stok`)
VALUES (@p,@o_jw,@pr_pcs,-1) ON DUPLICATE KEY UPDATE `stok` = `stok` + VALUES(`stok`);
INSERT INTO `pos_stok_mutasi`
  (`perusahaan_id`,`outlet_id`,`produk_id`,`jumlah`,`stok_akhir`,`tipe`,`karyawan_id`,`alasan_minus`,`catatan`)
VALUES (@p,@o_jw,@pr_pcs,-1,
        (SELECT stok FROM pos_stok_outlet WHERE outlet_id=@o_jw AND produk_id=@pr_pcs),
        'retail',@k_b,'belum_input','supplier datang malam, barang ada di rak');

-- Staff A files the Masuk. The -1 clears itself.
INSERT INTO `pos_stok_outlet` (`perusahaan_id`,`outlet_id`,`produk_id`,`stok`)
VALUES (@p,@o_jw,@pr_pcs,1) ON DUPLICATE KEY UPDATE `stok` = `stok` + VALUES(`stok`);
INSERT INTO `pos_stok_mutasi`
  (`perusahaan_id`,`outlet_id`,`produk_id`,`jumlah`,`stok_akhir`,`tipe`,`karyawan_id`,`supplier_id`,`harga_pokok`)
VALUES (@p,@o_jw,@pr_pcs,1,
        (SELECT stok FROM pos_stok_outlet WHERE outlet_id=@o_jw AND produk_id=@pr_pcs),
        'masuk',@k_a,@sup,5000.00);

COMMIT;
