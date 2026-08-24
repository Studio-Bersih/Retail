<?php
/**
 * Retail POS — sample data generator.
 *
 *   php database/faker.php              small scale  (~6k movements)
 *   php database/faker.php --scale=full full scale   (~35k movements)
 *   php database/faker.php --force      wipe existing rows without asking
 *
 * Writes ONLY to the `retail` database. Never touches `dao`.
 *
 * The stock history is produced by simulating forward day by day, so every
 * `stok_akhir` in pos_stok_mutasi is the true running balance and the cached
 * pos_stok_outlet.stok equals SUM(jumlah) for its (outlet, produk) by
 * construction. The drift check in 03_integrity_check.sql passes on this data.
 *
 * `rekap_id` values are synthetic: the document tables (spec §5.7) belong to
 * the next module and do not exist yet, so these point at nothing on purpose.
 */

declare(strict_types=1);
date_default_timezone_set('Asia/Jakarta');
mt_srand(20260824); // deterministic — same data every run

require __DIR__ . '/../../Marmyadose/vendor/autoload.php';

$opts   = getopt('', ['scale::', 'force']);
$FULL   = ($opts['scale'] ?? 'small') === 'full';
$FORCE  = array_key_exists('force', $opts);

$DSN  = 'mysql:host=127.0.0.1;port=3306;dbname=retail;charset=utf8mb4';
$pdo  = new PDO($DSN, 'root', 'root', [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
]);
$faker = Faker\Factory::create('id_ID');

// ---------------------------------------------------------------- helpers
function say(string $m): void { echo $m, PHP_EOL; }
function pick(array $a) { return $a[array_rand($a)]; }
function chance(int $pct): bool { return mt_rand(1, 100) <= $pct; }
function roundTo(float $v, int $step): float { return (float) (round($v / $step) * $step); }

/**
 * Quantities are carried through the simulation as INTEGER milli-units (1 kg =
 * 1000) and rendered to DECIMAL(15,3) only on write. Accumulating a running
 * balance in floats would drift, and the drift check compares that balance
 * against an exact DECIMAL SUM in MySQL - it would start failing for no real
 * reason. Same trick as storing money in cents.
 *
 * Returns a quantity legal for this unit: whole for discrete units, to the
 * nearest 50 g / 50 ml for the two that divide.
 */
function pecahanQty(string $unit, int $lo, int $hi): int
{
    if ($unit === 'kg' || $unit === 'liter') {
        return (int) (round(mt_rand($lo * 1000, $hi * 1000) / 50) * 50);
    }
    return mt_rand($lo, $hi) * 1000;
}

/** milli-units -> the string MySQL stores in DECIMAL(15,3). */
function qty(int $milli): string { return number_format($milli / 1000, 3, '.', ''); }

function batchInsert(PDO $pdo, string $table, array $cols, array $rows, int $chunk = 500): void
{
    if (!$rows) return;
    $colSql = '`' . implode('`,`', $cols) . '`';
    foreach (array_chunk($rows, $chunk) as $slice) {
        $tuples = [];
        foreach ($slice as $r) {
            $vals = [];
            foreach ($r as $v) {
                $vals[] = $v === null ? 'NULL' : (is_int($v) || is_float($v) ? (string) $v : $pdo->quote((string) $v));
            }
            $tuples[] = '(' . implode(',', $vals) . ')';
        }
        $pdo->exec("INSERT INTO `$table` ($colSql) VALUES " . implode(',', $tuples));
    }
}

// ---------------------------------------------------------------- guard
$existing = (int) $pdo->query('SELECT COUNT(*) c FROM sy_perusahaan')->fetch()['c'];
if ($existing > 0 && !$FORCE) {
    $mut = (int) $pdo->query('SELECT COUNT(*) c FROM pos_stok_mutasi')->fetch()['c'];
    say("The `retail` database already holds $existing companies and $mut stock movements.");
    say('Re-run with --force to wipe and regenerate. Nothing was changed.');
    exit(1);
}

say('Wiping `retail` … (sy_pricing is left alone - it is seeded by 05_subscription.sql)');
if (!$pdo->query("SHOW TABLES LIKE 'sy_subscription'")->fetch()) {
    say('sy_subscription is missing. Run database/05_subscription.sql first.');
    exit(1);
}
$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
foreach ([
    'pos_stok_mutasi','pos_stok_outlet','pos_harga_produk','pos_level_harga',
    'pos_master_konversi','pos_master_produk','pos_supplier','pos_merek','pos_jenis',
    'sy_payment_detail','sy_payment_rekap','sy_subscription',
    'sy_karyawan','sy_outlet','pos_satuan','pos_region','sy_perusahaan',
] as $t) {
    $pdo->exec("TRUNCATE TABLE `$t`");
}
$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

$t0 = microtime(true);

// ================================================================ globals
say('Global lookups …');

$REGIONS = [
    ['JW','Jawa'], ['KLM','Kalimantan'], ['SMT','Sumatra'],
    ['SLW','Sulawesi'], ['BAL','Bali & Nusa Tenggara'],
];
batchInsert($pdo, 'pos_region', ['kode','nama'], $REGIONS);
$regionId = [];
foreach ($pdo->query('SELECT id, kode FROM pos_region') as $r) $regionId[$r['kode']] = (int) $r['id'];

// is_pecahan: only kg and liter divide. A sak or a dus is a discrete package -
// "0.5 sak" is ambiguous, and a shop selling loose rice wants a kg product.
$SATUAN = [
    ['pcs','Pieces',0], ['box','Box',0], ['dus','Dus',0], ['pak','Pak',0],
    ['renceng','Renceng',0], ['botol','Botol',0], ['kg','Kilogram',1], ['liter','Liter',1],
    ['sak','Sak',0], ['lusin','Lusin',0],
];
batchInsert($pdo, 'pos_satuan', ['kode','nama','is_pecahan'], $SATUAN);
$satuanId = [];
foreach ($pdo->query('SELECT id, kode FROM pos_satuan') as $r) $satuanId[$r['kode']] = (int) $r['id'];

// ================================================================ catalog words
$CATALOG = [
    'Minuman' => [
        ['Air Mineral',      ['330ml','600ml','1500ml'],       ['botol','box'], 1800,  600],
        ['Teh Kotak',        ['200ml','300ml'],                ['pcs','dus'],   3500,  250],
        ['Kopi Susu Kaleng', ['240ml'],                        ['pcs','dus'],   6500,  260],
        ['Sirup',            ['460ml','630ml'],                ['botol'],       15500, 700],
        ['Susu UHT',         ['250ml','1L'],                   ['pcs','dus'],   6000, 1000],
    ],
    'Snack' => [
        ['Keripik Kentang',  ['68g','160g'],                   ['pcs','pak'],   9500,   68],
        ['Biskuit Kelapa',   ['120g','300g'],                  ['pak','dus'],   8000,  300],
        ['Wafer Coklat',     ['58g','145g'],                   ['pcs','pak'],   4500,  145],
        ['Kacang Kulit',     ['200g','500g'],                  ['pak'],         12000, 500],
    ],
    'Sembako' => [
        ['Beras Premium',    ['5kg','10kg','25kg','50kg'],     ['sak'],         13500, 50000],
        ['Minyak Goreng',    ['1L','2L'],                      ['botol','dus'], 17500, 1000],
        ['Gula Pasir',       ['500g','1kg'],                   ['pak','sak'],   14500, 1000],
        ['Tepung Terigu',    ['1kg'],                          ['pak','sak'],   11000, 1000],
        ['Garam Beryodium',  ['250g','500g'],                  ['pak'],         3000,  500],
    ],
    'Perawatan Diri' => [
        ['Sabun Mandi',      ['80g','250ml'],                  ['pcs','botol'], 5500,  250],
        ['Sampo',            ['70ml','170ml','340ml'],         ['botol','renceng'], 9000, 340],
        ['Pasta Gigi',       ['75g','190g'],                   ['pcs','box'],   11000, 190],
    ],
    'Rumah Tangga' => [
        ['Deterjen Bubuk',   ['380g','800g','1.8kg'],          ['pak','sak'],   14000, 1800],
        ['Pembersih Lantai', ['800ml','1.6L'],                 ['botol'],       16500, 1600],
        ['Tisu Wajah',       ['250s'],                         ['pak','dus'],   13000,  400],
    ],
    'Rokok & Korek' => [
        ['Korek Api Gas',    ['standar'],                      ['pcs','lusin'], 2500,   20],
    ],
    'Bumbu Dapur' => [
        ['Kecap Manis',      ['135ml','520ml'],                ['botol'],       9500,  520],
        ['Saus Sambal',      ['135ml','335ml'],                ['botol'],       8500,  335],
        ['Penyedap Rasa',    ['8g','100g'],                    ['renceng','pak'], 500,  100],
    ],
    // sold by weight or volume - these exercise the fractional path
    'Curah' => [
        ['Es Balok',         ['curah'],  ['kg'],    2500,  1000],
        ['Beras Curah',      ['curah'],  ['kg'],   13000,  1000],
        ['Gula Pasir Curah', ['curah'],  ['kg'],   15500,  1000],
        ['Minyak Curah',     ['curah'],  ['liter'],16000,  1000],
        ['Minyak Tanah',     ['curah'],  ['liter'],12000,  1000],
    ],
    'Makanan Instan' => [
        ['Mi Instan Goreng', ['85g'],                          ['pcs','dus'],   3200,   85],
        ['Mi Instan Kuah',   ['70g'],                          ['pcs','dus'],   3000,   70],
        ['Bubur Instan',     ['46g'],                          ['pcs','dus'],   4200,   46],
    ],
];

$BRANDS = ['Sumber Jaya','Mekar Sari','Bintang Timur','Cahaya Abadi','Tirta Murni',
           'Roda Mas','Sekar Wangi','Anugerah','Nusa Prima','Berkah Tani','Dwi Tunggal',
           'Harum Manis','Kencana','Lestari','Mutiara','Padi Emas','Sinar Baru','Tunas Muda'];

// ================================================================ builder
/**
 * @return array{perusahaan_id:int, outlets:array, karyawan:array, produk:array, levels:array}
 */
function buildCompany(
    PDO $pdo, $faker, array $cfg, array $regionId, array $satuanId, array $CATALOG, array $BRANDS
): array {
    $pdo->prepare('INSERT INTO sy_perusahaan (kode, nama) VALUES (?, ?)')
        ->execute([$cfg['kode'], $cfg['nama']]);
    $pid = (int) $pdo->lastInsertId();

    // ---- subscription FIRST (spec §6.5)
    // The quota triggers refuse an outlet or staff insert when no subscription
    // row exists, so this cannot be done later. Quota is sized to what this
    // company is about to create, plus headroom - which is what a customer of
    // this size would actually have bought.
    $kuotaOutlet   = $cfg['outlets'] + $cfg['seat_headroom'];
    $kuotaKaryawan = $cfg['outlets'] * $cfg['staff_per_outlet']
                   + $cfg['auditors'] + $cfg['admins'] + $cfg['seat_headroom'];

    $pdo->prepare(
        'INSERT INTO sy_subscription
           (perusahaan_id, berlaku_sampai, kuota_outlet, kuota_karyawan, catatan, diubah_oleh)
         VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([$pid, $cfg['berlaku_sampai'], $kuotaOutlet, $kuotaKaryawan,
                $cfg['catatan_langganan'], 'Sistem (faker)']);

    // ---- the payment that bought that term
    $tarif = [];
    foreach ($pdo->query('SELECT jenis, harga_per_bulan FROM sy_pricing') as $r) {
        $tarif[$r['jenis']] = (float) $r['harga_per_bulan'];
    }
    $bulan   = 12;
    $barisOutlet   = $kuotaOutlet   * $bulan * $tarif['outlet'];
    $barisKaryawan = $kuotaKaryawan * $bulan * $tarif['karyawan'];

    $pdo->prepare(
        'INSERT INTO sy_payment_rekap
           (perusahaan_id, nomor, tanggal, periode_mulai, periode_sampai,
            total, status, metode, catatan, dicatat_oleh)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $pid,
        'INV-' . date('Y') . '-' . $cfg['kode'],
        $cfg['periode_mulai'],
        $cfg['periode_mulai'],
        $cfg['berlaku_sampai'],
        $barisOutlet + $barisKaryawan,
        'lunas',
        'transfer BCA',
        'Perpanjangan tahunan',
        'Sistem (faker)',
    ]);
    $rekapId = (int) $pdo->lastInsertId();

    batchInsert($pdo, 'sy_payment_detail',
        ['perusahaan_id','rekap_id','jenis','keterangan','jumlah','bulan','harga_per_bulan','subtotal'], [
        [$pid, $rekapId, 'outlet',   'Outlet / cabang', $kuotaOutlet,   $bulan, $tarif['outlet'],   $barisOutlet],
        [$pid, $rekapId, 'karyawan', 'Staff',           $kuotaKaryawan, $bulan, $tarif['karyawan'], $barisKaryawan],
    ]);

    // ---- outlets
    $cities = ['Bandung','Bekasi','Depok','Tangerang','Bogor','Cirebon','Semarang','Solo',
               'Surabaya','Malang','Balikpapan','Samarinda','Banjarmasin','Pontianak',
               'Palembang','Medan','Padang','Pekanbaru','Makassar','Manado','Denpasar','Mataram'];
    $regionOfCity = [
        'Bandung'=>'JW','Bekasi'=>'JW','Depok'=>'JW','Tangerang'=>'JW','Bogor'=>'JW','Cirebon'=>'JW',
        'Semarang'=>'JW','Solo'=>'JW','Surabaya'=>'JW','Malang'=>'JW',
        'Balikpapan'=>'KLM','Samarinda'=>'KLM','Banjarmasin'=>'KLM','Pontianak'=>'KLM',
        'Palembang'=>'SMT','Medan'=>'SMT','Padang'=>'SMT','Pekanbaru'=>'SMT',
        'Makassar'=>'SLW','Manado'=>'SLW','Denpasar'=>'BAL','Mataram'=>'BAL',
    ];
    $outletRows = []; $seq = 0;
    $useRegions = $cfg['regions'];
    foreach (array_slice($cfg['cities'], 0, $cfg['outlets']) as $i => $city) {
        $seq++;
        $isGudang = $cfg['gudang'] > 0 && $i < $cfg['gudang'];
        $rid = $useRegions ? ($regionId[$regionOfCity[$city] ?? 'JW'] ?? null) : null;
        $outletRows[] = [
            $pid,
            sprintf('%s%02d', $isGudang ? 'G' : 'O', $seq),
            ($isGudang ? 'FLC ' : 'Outlet ') . $city . ($i >= count($cfg['cities']) ? '' : ''),
            $rid,
            $isGudang ? 'gudang' : 'outlet',
            $faker->streetAddress() . ', ' . $city,
            1,
        ];
    }
    batchInsert($pdo, 'sy_outlet',
        ['perusahaan_id','kode','nama','region_id','tipe','alamat','is_active'], $outletRows);

    $outlets = [];
    $st = $pdo->prepare('SELECT id, kode, nama, region_id, tipe FROM sy_outlet WHERE perusahaan_id = ?');
    $st->execute([$pid]);
    foreach ($st as $r) {
        $outlets[] = ['id'=>(int)$r['id'], 'kode'=>$r['kode'], 'nama'=>$r['nama'],
                      'region_id'=>$r['region_id'] !== null ? (int)$r['region_id'] : null,
                      'tipe'=>$r['tipe']];
    }

    // ---- employees
    $kRows = []; $n = 0;
    foreach ($outlets as $o) {
        foreach (range(1, $cfg['staff_per_outlet']) as $_) {
            $n++;
            $kRows[] = [$pid, sprintf('%s%04d', $cfg['kode'][0], $n), $faker->name(), $o['id'],
                        chance(20) ? 'supervisor' : 'staff', 1];
        }
    }
    foreach (range(1, $cfg['auditors']) as $_) { $n++; $kRows[] = [$pid, sprintf('%s%04d', $cfg['kode'][0], $n), $faker->name(), null, 'auditor', 1]; }
    foreach (range(1, $cfg['admins'])   as $_) { $n++; $kRows[] = [$pid, sprintf('%s%04d', $cfg['kode'][0], $n), $faker->name(), null, 'admin',   1]; }
    batchInsert($pdo, 'sy_karyawan', ['perusahaan_id','nip','nama','outlet_id','peran','is_active'], $kRows);

    $karyawan = ['byOutlet'=>[], 'privileged'=>[]];
    $st = $pdo->prepare('SELECT id, outlet_id, peran FROM sy_karyawan WHERE perusahaan_id = ?');
    $st->execute([$pid]);
    foreach ($st as $r) {
        $id = (int) $r['id'];
        if (in_array($r['peran'], ['auditor','admin'], true)) $karyawan['privileged'][] = $id;
        if ($r['outlet_id'] !== null) $karyawan['byOutlet'][(int)$r['outlet_id']][] = $id;
    }

    // ---- lookups
    $jenisNames = array_slice(array_keys($CATALOG), 0, $cfg['jenis']);
    batchInsert($pdo, 'pos_jenis', ['perusahaan_id','nama'], array_map(fn($j) => [$pid, $j], $jenisNames));
    $jenisId = [];
    $st = $pdo->prepare('SELECT id, nama FROM pos_jenis WHERE perusahaan_id = ?'); $st->execute([$pid]);
    foreach ($st as $r) $jenisId[$r['nama']] = (int) $r['id'];

    $brandNames = array_slice($BRANDS, 0, $cfg['merek']);
    batchInsert($pdo, 'pos_merek', ['perusahaan_id','nama'], array_map(fn($b) => [$pid, $b], $brandNames));
    $merekIds = [];
    $st = $pdo->prepare('SELECT id FROM pos_merek WHERE perusahaan_id = ?'); $st->execute([$pid]);
    foreach ($st as $r) $merekIds[] = (int) $r['id'];

    $supRows = [];
    foreach (range(1, $cfg['supplier']) as $i) {
        $supRows[] = [$pid, sprintf('SUP%03d', $i), $faker->company(), $faker->phoneNumber(),
                      $faker->address(), chance(92) ? 1 : 0];
    }
    batchInsert($pdo, 'pos_supplier', ['perusahaan_id','kode','nama','telepon','alamat','is_active'], $supRows);
    $supplierIds = [];
    $st = $pdo->prepare('SELECT id FROM pos_supplier WHERE perusahaan_id = ? AND is_active = 1'); $st->execute([$pid]);
    foreach ($st as $r) $supplierIds[] = (int) $r['id'];

    // ---- products
    $prodRows = []; $codeSeq = 11000; $barcodes = []; $meta = [];
    $anyKaryawan = array_merge($karyawan['privileged'], ...array_values($karyawan['byOutlet']));

    foreach ($jenisNames as $jName) {
        foreach ($CATALOG[$jName] as [$base, $variants, $units, $baseCost, $gram]) {
            foreach ($variants as $variant) {
                foreach (array_slice($merekIds, 0, $cfg['brands_per_line']) as $mid) {
                    if (count($prodRows) >= $cfg['produk']) break 4;
                    $codeSeq++;
                    $unit  = $units[0];
                    $cost  = roundTo($baseCost * mt_rand(85, 125) / 100, 50);
                    $bc    = null;
                    if (chance(62)) { do { $bc = '899' . mt_rand(1000000000, 9999999999); } while (isset($barcodes[$bc])); $barcodes[$bc] = true; }
                    $nama  = "$base $variant";
                    $kode  = (string) $codeSeq;

                    $prodRows[] = [$pid, $kode, $nama . ' (' . ucfirst($unit) . ')', $satuanId[$unit],
                                   $jenisId[$jName], $mid, pick($supplierIds), $bc, $gram,
                                   chance(35) ? $faker->sentence(9) : null, null,
                                   chance(88) ? 'aktif' : (chance(50) ? 'tidak_aktif' : 'diskontinu'),
                                   pick($anyKaryawan), null];
                    $meta[$kode] = ['cost'=>$cost, 'unit'=>$unit, 'nama'=>$nama];

                    // a bulk sibling for some lines — the konversi pair
                    if (count($units) > 1 && chance(45) && count($prodRows) < $cfg['produk']) {
                        $bulk  = $units[1];
                        $per   = pick([6, 12, 20, 24]);
                        $bkode = $kode . 'B';
                        $prodRows[] = [$pid, $bkode, $nama . ' (' . ucfirst($bulk) . ')', $satuanId[$bulk],
                                       $jenisId[$jName], $mid, pick($supplierIds),
                                       chance(30) ? '899' . mt_rand(1000000000, 9999999999) : null,
                                       $gram * $per, null, null, 'aktif', pick($anyKaryawan), null];
                        $meta[$bkode] = ['cost'=>$cost * $per * 0.94, 'unit'=>$bulk, 'nama'=>$nama,
                                         'pairs_with'=>$kode, 'per'=>$per];
                    }
                }
            }
        }
    }
    batchInsert($pdo, 'pos_master_produk',
        ['perusahaan_id','kode','nama','satuan_id','jenis_id','merek_id','supplier_id','barcode',
         'berat_gram','deskripsi','gambar_url','status','created_by_id','updated_by_id'], $prodRows);

    $produk = [];
    $st = $pdo->prepare('SELECT id, kode, status FROM pos_master_produk WHERE perusahaan_id = ?');
    $st->execute([$pid]);
    foreach ($st as $r) {
        $produk[$r['kode']] = ['id'=>(int)$r['id'], 'kode'=>$r['kode'], 'status'=>$r['status']] + $meta[$r['kode']];
    }

    // ---- konversi recipes (bulk -> retail unit)
    $konvRows = [];
    foreach ($produk as $kode => $p) {
        if (!isset($p['pairs_with'])) continue;
        $target = $produk[$p['pairs_with']] ?? null;
        if (!$target) continue;
        $konvRows[] = [$pid, $p['id'], 1, $target['id'], $p['per'], 1];
    }
    batchInsert($pdo, 'pos_master_konversi',
        ['perusahaan_id','produk_asal_id','jumlah_asal','produk_tujuan_id','jumlah_tujuan','is_active'], $konvRows);

    // ---- price levels + prices
    $levelRows = [];
    foreach ($cfg['levels'] as $i => $lname) $levelRows[] = [$pid, $lname, $i + 1, $i === 0 ? 1 : 0];
    batchInsert($pdo, 'pos_level_harga', ['perusahaan_id','nama','sequence','is_default'], $levelRows);
    $levels = [];
    $st = $pdo->prepare('SELECT id, nama, sequence FROM pos_level_harga WHERE perusahaan_id = ? ORDER BY sequence');
    $st->execute([$pid]);
    foreach ($st as $r) $levels[$r['nama']] = (int) $r['id'];

    $priceRows = [];
    $usedRegions = $useRegions ? array_values($regionId) : [];
    foreach ($produk as $p) {
        foreach ($cfg['levels'] as $lname) {
            $mult = $cfg['margin'][$lname];
            $priceRows[] = [$pid, $p['id'], $levels[$lname], null, roundTo($p['cost'] * $mult, 100)];
        }
        // regional override on the default level for roughly a fifth of the catalog
        if ($usedRegions && chance(21)) {
            $rid  = pick($usedRegions);
            $lname = $cfg['levels'][0];
            $priceRows[] = [$pid, $p['id'], $levels[$lname], $rid,
                            roundTo($p['cost'] * $cfg['margin'][$lname] * mt_rand(108, 128) / 100, 100)];
        }
    }
    batchInsert($pdo, 'pos_harga_produk',
        ['perusahaan_id','produk_id','level_harga_id','region_id','harga'], $priceRows);

    return ['perusahaan_id'=>$pid, 'outlets'=>$outlets, 'karyawan'=>$karyawan,
            'produk'=>$produk, 'levels'=>$levels];
}

// ================================================================ stock simulation
function simulateStock(PDO $pdo, array $co, array $cfg, array &$rekap): array
{
    $pid      = $co['perusahaan_id'];
    $outlets  = $co['outlets'];
    $produk   = array_values(array_filter($co['produk'], fn($p) => $p['status'] === 'aktif'));
    $shops    = array_values(array_filter($outlets, fn($o) => $o['tipe'] === 'outlet'));
    $gudangs  = array_values(array_filter($outlets, fn($o) => $o['tipe'] === 'gudang'));
    if (!$gudangs) $gudangs = $shops;

    $suppliers = [];
    $st = $pdo->prepare('SELECT id FROM pos_supplier WHERE perusahaan_id = ? AND is_active = 1'); $st->execute([$pid]);
    foreach ($st as $r) $suppliers[] = (int) $r['id'];

    $konversi = [];
    $st = $pdo->prepare('SELECT produk_asal_id, jumlah_asal, produk_tujuan_id, jumlah_tujuan FROM pos_master_konversi WHERE perusahaan_id = ?');
    $st->execute([$pid]);
    foreach ($st as $r) $konversi[] = [
    'produk_asal_id'   => (int) $r['produk_asal_id'],
    'jumlah_asal'      => (int) round((float) $r['jumlah_asal']   * 1000),
    'produk_tujuan_id' => (int) $r['produk_tujuan_id'],
    'jumlah_tujuan'    => (int) round((float) $r['jumlah_tujuan'] * 1000),
];

    $unitOf = [];
    foreach ($produk as $pp) $unitOf[$pp['id']] = $pp['unit'];

    $bal  = [];  // [outlet_id][produk_id] => milli-units (int)
    $rows = [];  // pos_stok_mutasi tuples
    // $rekap is shared across companies: the document tables it will point at have a
    // single auto-increment key, so two companies never reuse the same rekap_id.

    $staffAt = function (int $outletId) use ($co, $outlets) {
        $list = $co['karyawan']['byOutlet'][$outletId] ?? null;
        if ($list) return pick($list);
        return pick($co['karyawan']['privileged']);
    };

    // $jumlah is in milli-units. $bal is in milli-units. Only the written row is decimal.
    $move = function (int $outletId, int $produkId, int $jumlah, string $tipe, int $karyawanId,
                      ?string $rekapTipe, ?int $rekapId, ?int $supplierId, ?float $hargaPokok,
                      ?int $lawanId, ?string $alasan, ?string $catatan, string $ts)
             use (&$bal, &$rows, $pid) {
        $now = ($bal[$outletId][$produkId] ?? 0) + $jumlah;
        $bal[$outletId][$produkId] = $now;
        $rows[] = [$pid, $outletId, $produkId, qty($jumlah), qty($now), $tipe, $rekapTipe, $rekapId,
                   $supplierId, $hargaPokok, $lawanId, $alasan, $catatan, $karyawanId, $ts];
    };

    $days  = $cfg['days'];
    $start = new DateTimeImmutable("-{$days} days 08:00:00");

    // --- day 0: opening receipts, so each outlet carries a slice of the catalog
    say('  opening stock …');
    foreach ($outlets as $o) {
        $take = mt_rand($cfg['assort'][0], $cfg['assort'][1]);
        $keys = (array) array_rand($produk, min($take, count($produk)));
        foreach ($keys as $k) {
            $p   = $produk[$k];
            $qty = pecahanQty($p['unit'], 20, 400);
            $rekap['masuk']++;
            $move($o['id'], $p['id'], $qty, 'masuk', $staffAt($o['id']), 'masuk', $rekap['masuk'],
                  pick($suppliers), roundTo($p['cost'], 50), null, null, 'stok awal',
                  $start->format('Y-m-d H:i:s'));
        }
    }

    // --- daily simulation
    //
    // Each day's events are shuffled into one schedule and stamped from a clock that
    // only moves forward, so the order rows are written in IS their chronological
    // order. Without that, `stok_akhir` would be a running total in insert order but
    // nonsense when the ledger is replayed by `created_at` — which is how an auditor
    // would read it.
    say('  simulating ' . $days . ' days of trade …');
    for ($d = 1; $d <= $days; $d++) {
        $day = $start->modify("+$d days");

        $schedule = array_merge(
            array_fill(0, $cfg['sales_per_day'],    'sale'),
            array_fill(0, $cfg['restock_per_day'],  'restock'),
            array_fill(0, $cfg['transfer_per_day'], 'transfer'),
            array_fill(0, $cfg['konversi_per_day'], 'konversi'),
            array_fill(0, $cfg['misc_per_day'],     'misc'),
        );
        shuffle($schedule);

        $minute  = 0;
        $stepMax = max(1, (int) (1400 / max(1, count($schedule))));
        $tick = function () use (&$minute, $stepMax, $day): string {
            $minute = min($minute + mt_rand(0, $stepMax), 780);   // 08:00 → 21:00
            return $day->modify("+$minute minutes")->format('Y-m-d H:i:s');
        };

        foreach ($schedule as $intent) {
        if ($intent === 'sale') {
            $ts = $tick();
            $o = pick($shops);
            $stocked = array_keys($bal[$o['id']] ?? []);
            if (!$stocked) continue;
            $prodId = pick($stocked);
            $qty    = pecahanQty($unitOf[$prodId] ?? 'pcs', 1, 6);
            $after  = $bal[$o['id']][$prodId] - $qty;
            $alasan = $catatan = null;
            if ($after < 0) {
                // spec §5.6 — selling into negative is allowed, but must carry a reason
                if (!chance(35)) continue;                     // usually the cashier just can't
                $alasan  = pick(['belum_input','salah_hitung','retur_belum_proses','lainnya']);
                $catatan = pick([
                    'supplier datang malam, barang ada di rak',
                    'selisih hasil hitung kemarin',
                    'retur dari pelanggan belum diproses',
                    'barang titipan dari outlet sebelah',
                ]);
            }
            $rekap['retail']++;
            $move($o['id'], $prodId, -$qty, 'retail', $staffAt($o['id']), 'retail', $rekap['retail'],
                  null, null, null, $alasan, $catatan, $ts);

        } elseif ($intent === 'restock') {
            $ts = $tick();
            $o = pick($outlets);
            $p = $produk[array_rand($produk)];
            $rekap['masuk']++;
            $move($o['id'], $p['id'], pecahanQty($p['unit'], 6, 120), 'masuk', $staffAt($o['id']), 'masuk', $rekap['masuk'],
                  pick($suppliers), roundTo($p['cost'] * mt_rand(94, 108) / 100, 50), null, null, null, $ts);

        } elseif ($intent === 'transfer') {
            // gudang -> outlet, two rows sharing one rekap_id
            $from = pick($gudangs); $to = pick($shops);
            if ($from['id'] === $to['id']) continue;
            $stocked = array_keys(array_filter($bal[$from['id']] ?? [], fn($v) => $v > 12));
            if (!$stocked) continue;
            $prodId = pick($stocked);
            $qty    = min(mt_rand(4, 30) * 1000, $bal[$from['id']][$prodId]);
            $rekap['transfer']++; $rk = $rekap['transfer'];
            $ts = $tick();
            $move($from['id'], $prodId, -$qty, 'transfer', $staffAt($from['id']), 'transfer', $rk, null, null, $to['id'],   null, null, $ts);
            $move($to['id'],   $prodId,  $qty, 'transfer', $staffAt($to['id']),   'transfer', $rk, null, null, $from['id'], null, null, $ts);

        } elseif ($intent === 'konversi') {
            // two rows sharing one rekap_id, opposite signs, different products
            if (!$konversi) continue;
            $k = pick($konversi);
            $o = pick($outlets);
            if (($bal[$o['id']][$k['produk_asal_id']] ?? 0) < $k['jumlah_asal']) continue;
            $rekap['konversi']++; $rk = $rekap['konversi'];
            $ts  = $tick();
            $who = $staffAt($o['id']);
            $move($o['id'], $k['produk_asal_id'],   -$k['jumlah_asal'],   'konversi', $who, 'konversi', $rk, null, null, null, null, null, $ts);
            $move($o['id'], $k['produk_tujuan_id'],  $k['jumlah_tujuan'], 'konversi', $who, 'konversi', $rk, null, null, null, null, null, $ts);

        } else {
            // returns, wastage, and audited adjustments
            $o = pick($shops);
            $stocked = array_keys($bal[$o['id']] ?? []);
            if (!$stocked) continue;
            $prodId = pick($stocked);
            $ts = $tick();
            $roll = mt_rand(1, 100);
            if ($roll <= 40) {
                $rekap['retur']++;
                $move($o['id'], $prodId, pecahanQty($unitOf[$prodId] ?? 'pcs', 1, 4), 'retur', $staffAt($o['id']), 'retur', $rekap['retur'],
                      null, null, null, null, 'retur pelanggan', $ts);
            } elseif ($roll <= 75) {
                $qty = min(pecahanQty($unitOf[$prodId] ?? 'pcs', 1, 5), max(0, $bal[$o['id']][$prodId]));
                if ($qty <= 0) continue;
                $rekap['keluar']++;
                $move($o['id'], $prodId, -$qty, 'keluar', $staffAt($o['id']), 'keluar', $rekap['keluar'],
                      null, null, null, null, pick(['rusak','kadaluarsa','sampel']), $ts);
            } else {
                // penyesuaian: absolute count, only auditor/admin may write it
                $target = max(0, $bal[$o['id']][$prodId] + mt_rand(-4, 4) * 1000);
                $jumlah = $target - $bal[$o['id']][$prodId];
                if ($jumlah === 0) continue;
                $move($o['id'], $prodId, $jumlah, 'penyesuaian', pick($co['karyawan']['privileged']),
                      null, null, null, null, null, null, 'hasil stock opname', $ts);
            }
        }
        } // end schedule
    }

    say('  writing ' . number_format(count($rows)) . ' movements …');
    batchInsert($pdo, 'pos_stok_mutasi',
        ['perusahaan_id','outlet_id','produk_id','jumlah','stok_akhir','tipe','rekap_tipe','rekap_id',
         'supplier_id','harga_pokok','outlet_lawan_id','alasan_minus','catatan','karyawan_id','created_at'],
        $rows, 400);

    // cached balances — taken straight from the simulation, so they cannot drift
    $balRows = [];
    foreach ($bal as $outletId => $byProduk) {
        foreach ($byProduk as $produkId => $stok) $balRows[] = [$pid, $outletId, $produkId, qty($stok)];
    }
    batchInsert($pdo, 'pos_stok_outlet', ['perusahaan_id','outlet_id','produk_id','stok'], $balRows);

    return ['movements'=>count($rows), 'balances'=>count($balRows)];
}

// ================================================================ run
$CITIES_A = ['Bandung','Bekasi','Depok','Tangerang','Bogor','Cirebon','Semarang','Solo','Surabaya','Malang',
             'Balikpapan','Samarinda','Banjarmasin','Pontianak','Palembang','Medan','Padang','Pekanbaru',
             'Makassar','Manado','Denpasar','Mataram'];

$companies = [
    [
        'kode'=>'ACME', 'nama'=>'PT Acme Retail Nusantara',
        'seat_headroom'=>10,
        'periode_mulai'=>date('Y-m-d', strtotime('-2 months')),
        'berlaku_sampai'=>date('Y-m-d', strtotime('+10 months')),
        'catatan_langganan'=>null,
        'cities'=>array_merge($CITIES_A, $CITIES_A, $CITIES_A),
        'outlets'=>$FULL ? 56 : 18, 'gudang'=>$FULL ? 5 : 2, 'regions'=>true,
        'staff_per_outlet'=>3, 'auditors'=>3, 'admins'=>2,
        'jenis'=>9, 'merek'=>18, 'supplier'=>24, 'brands_per_line'=>$FULL ? 8 : 3,
        'produk'=>$FULL ? 900 : 260,
        'levels'=>['Retail','GoFood','Transfer Pabrik'],
        'margin'=>['Retail'=>1.62,'GoFood'=>2.18,'Transfer Pabrik'=>1.15],
        'days'=>$FULL ? 120 : 45,
        'assort'=>$FULL ? [110, 220] : [55, 110],
        'sales_per_day'=>$FULL ? 210 : 70, 'restock_per_day'=>$FULL ? 40 : 14,
        'transfer_per_day'=>$FULL ? 10 : 4, 'konversi_per_day'=>$FULL ? 8 : 3,
        'misc_per_day'=>$FULL ? 14 : 5,
    ],
    [
        // the flat-price company: one level, no regions — proves that path stays simple
        'kode'=>'KOPI', 'nama'=>'CV Kopi Sederhana',
        // deliberately close to expiry, so the `subscription` view shows a warning
        'seat_headroom'=>2,
        'periode_mulai'=>date('Y-m-d', strtotime('-11 months 20 days')),
        'berlaku_sampai'=>date('Y-m-d', strtotime('+10 days')),
        'catatan_langganan'=>'Transfer belum masuk - diperpanjang 3 hari manual',
        'cities'=>['Solo','Yogyakarta','Salatiga','Klaten'],
        'outlets'=>4, 'gudang'=>1, 'regions'=>false,
        'staff_per_outlet'=>2, 'auditors'=>1, 'admins'=>1,
        'jenis'=>3, 'merek'=>4, 'supplier'=>5, 'brands_per_line'=>2,
        'produk'=>38,
        'levels'=>['Harga Jual'],
        'margin'=>['Harga Jual'=>1.55],
        'days'=>$FULL ? 120 : 45,
        'assort'=>[20, 34],
        'sales_per_day'=>18, 'restock_per_day'=>4,
        'transfer_per_day'=>1, 'konversi_per_day'=>1, 'misc_per_day'=>2,
    ],
];

$rekap = ['masuk'=>0,'keluar'=>0,'transfer'=>0,'konversi'=>0,'retail'=>0,'retur'=>0];

foreach ($companies as $cfg) {
    say(PHP_EOL . $cfg['nama'] . ' …');
    $co = buildCompany($pdo, $faker, $cfg, $regionId, $satuanId, $CATALOG, $BRANDS);
    $r  = simulateStock($pdo, $co, $cfg, $rekap);
    say('  ' . number_format($r['movements']) . ' movements, ' . number_format($r['balances']) . ' balance rows');
}

// ================================================================ report
say(PHP_EOL . str_repeat('-', 62));
foreach ([
    'sy_perusahaan','pos_region','pos_satuan','sy_outlet','sy_karyawan','pos_jenis','pos_merek',
    'pos_supplier','pos_master_produk','pos_master_konversi','pos_level_harga','pos_harga_produk',
    'pos_stok_outlet','pos_stok_mutasi',
    'sy_pricing','sy_subscription','sy_payment_rekap','sy_payment_detail',
] as $t) {
    $c = (int) $pdo->query("SELECT COUNT(*) c FROM `$t`")->fetch()['c'];
    printf("  %-22s %s%s", $t, number_format($c), PHP_EOL);
}
printf('%s  done in %.1fs%s', PHP_EOL, microtime(true) - $t0, PHP_EOL);
