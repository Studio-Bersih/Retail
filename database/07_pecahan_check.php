<?php
/**
 * Retail POS — fractional quantity checks.
 *
 *   php database/07_pecahan_check.php
 *
 * Every test runs inside a transaction and is rolled back. Several are expected
 * to FAIL — a rule that refuses nothing is not a rule.
 *
 * Run after 01_schema.sql, 05_subscription.sql and faker.php.
 */

declare(strict_types=1);

$pdo = new PDO('mysql:host=127.0.0.1;port=3306;dbname=retail;charset=utf8mb4', 'root', 'root', [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
]);

$pass = 0; $fail = 0;
function ok(string $l, string $d=''): void  { global $pass; $pass++; printf("  PASS  %-56s %s%s", $l, $d, PHP_EOL); }
function bad(string $l, string $d=''): void { global $fail; $fail++; printf("  FAIL  %-56s %s%s", $l, $d, PHP_EOL); }

function expectOk(PDO $pdo, string $l, callable $fn): void {
    $pdo->beginTransaction();
    try { $d = $fn($pdo) ?? ''; $pdo->rollBack(); ok($l, (string) $d); }
    catch (Throwable $e) { $pdo->rollBack(); bad($l, '-> unexpectedly refused: ' . trim($e->getMessage())); }
}
function expectRefused(PDO $pdo, string $l, string $needle, callable $fn): void {
    $pdo->beginTransaction();
    try { $fn($pdo); $pdo->rollBack(); bad($l, '-> was ACCEPTED but should have been refused'); }
    catch (Throwable $e) {
        $pdo->rollBack(); $m = trim($e->getMessage());
        if (stripos($m, $needle) !== false) ok($l, '-> ' . substr(preg_replace('/\s+/', ' ', $m), 0, 64));
        else bad($l, '-> refused for the WRONG reason: ' . substr($m, 0, 90));
    }
}

// a divisible product and a whole-only one, both stocked at the same outlet
$row = $pdo->query("
  SELECT p.id AS produk_id, so.outlet_id, p.perusahaan_id, so.stok
  FROM pos_stok_outlet so
  JOIN pos_master_produk p ON p.id = so.produk_id
  JOIN pos_satuan s ON s.id = p.satuan_id
  WHERE s.is_pecahan = 1 LIMIT 1")->fetch();
$whole = $pdo->query("
  SELECT p.id AS produk_id, so.outlet_id, p.perusahaan_id, so.stok
  FROM pos_stok_outlet so
  JOIN pos_master_produk p ON p.id = so.produk_id
  JOIN pos_satuan s ON s.id = p.satuan_id
  WHERE s.is_pecahan = 0 AND so.outlet_id = {$row['outlet_id']} LIMIT 1")->fetch();
$kar = (int) $pdo->query("SELECT id FROM sy_karyawan WHERE perusahaan_id={$row['perusahaan_id']} LIMIT 1")->fetch()['id'];

$mv = function (array $t, string $jumlah, string $akhir) use ($kar) {
    return "INSERT INTO pos_stok_mutasi
              (perusahaan_id,outlet_id,produk_id,jumlah,stok_akhir,tipe,karyawan_id)
            VALUES ({$t['perusahaan_id']},{$t['outlet_id']},{$t['produk_id']},$jumlah,$akhir,'masuk',$kar)";
};

echo PHP_EOL, '--- a unit that divides (kg / liter) ---', PHP_EOL;

expectOk($pdo, '1.5 of a divisible unit is accepted', function (PDO $p) use ($mv,$row) {
    $p->exec($mv($row, '1.500', '1.500'));
    return '-> 1.5 kg of ice is storable at all';
});
expectOk($pdo, '0.001 — one gram — is accepted', function (PDO $p) use ($mv,$row) {
    $p->exec($mv($row, '0.001', '0.001'));
    return '-> DECIMAL(15,3) reaches gram precision';
});
expectOk($pdo, 'a whole quantity on a divisible unit is still fine', function (PDO $p) use ($mv,$row) {
    $p->exec($mv($row, '3.000', '3.000'));
});

echo PHP_EOL, '--- a unit that does not divide (pcs, box, sak, ...) ---', PHP_EOL;

expectRefused($pdo, 'a fractional jumlah is refused', 'tidak boleh pecahan', function (PDO $p) use ($mv,$whole) {
    $p->exec($mv($whole, '1.500', '1.500'));
});
expectRefused($pdo, 'a fractional stok_akhir is refused', 'tidak boleh pecahan', function (PDO $p) use ($mv,$whole) {
    $p->exec($mv($whole, '2.000', '2.500'));
});
expectOk($pdo, 'a whole quantity is accepted', function (PDO $p) use ($mv,$whole) {
    $p->exec($mv($whole, '2.000', '2.000'));
    return '-> 2 boxes, as always';
});

echo PHP_EOL, '--- exactness: the property the drift check depends on ---', PHP_EOL;

expectOk($pdo, 'ten additions of 0.1 sum to exactly 1.000', function (PDO $p) use ($row,$kar) {
    $p->exec("CREATE TEMPORARY TABLE zz_sum (v DECIMAL(15,3) NOT NULL)");
    for ($i = 0; $i < 10; $i++) $p->exec("INSERT INTO zz_sum VALUES (0.100)");
    $r = $p->query("SELECT SUM(v) s, SUM(v) = 1.000 AS exact_ FROM zz_sum")->fetch();
    $p->exec("DROP TEMPORARY TABLE zz_sum");
    if (!$r['exact_']) throw new RuntimeException('DECIMAL sum was not exact: ' . $r['s']);
    return "-> SUM = {$r['s']} exactly. FLOAT would give 0.9999999999999999";
});

expectOk($pdo, 'the whole ledger still replays to the cached balance', function (PDO $p) {
    $n = (int) $p->query("
      SELECT COUNT(*) c FROM (
        SELECT so.id FROM pos_stok_outlet so
        JOIN pos_stok_mutasi mu ON mu.outlet_id=so.outlet_id AND mu.produk_id=so.produk_id
        GROUP BY so.id, so.stok HAVING so.stok <> SUM(mu.jumlah)) x")->fetch()['c'];
    if ($n) throw new RuntimeException("$n balance rows drifted");
    $rows = (int) $p->query("SELECT COUNT(*) c FROM pos_stok_mutasi")->fetch()['c'];
    $frac = (int) $p->query("SELECT COUNT(*) c FROM pos_stok_mutasi WHERE jumlah <> TRUNCATE(jumlah,0)")->fetch()['c'];
    return "-> 0 drifted across $rows movements, $frac of them fractional";
});

echo PHP_EOL, '--- the flag lives on the unit, so it cannot be set inconsistently ---', PHP_EOL;

expectOk($pdo, 'every product of a given unit behaves identically', function (PDO $p) {
    $n = (int) $p->query("
      SELECT COUNT(*) c FROM (
        SELECT p.satuan_id FROM pos_master_produk p
        JOIN pos_satuan s ON s.id = p.satuan_id
        GROUP BY p.satuan_id HAVING COUNT(DISTINCT s.is_pecahan) > 1) x")->fetch()['c'];
    if ($n) throw new RuntimeException('a unit disagreed with itself');
    $d = $p->query("SELECT GROUP_CONCAT(kode ORDER BY kode) k FROM pos_satuan WHERE is_pecahan=1")->fetch()['k'];
    return "-> divisible units: $d";
});

echo PHP_EOL;
printf('%d passed, %d failed%s', $pass, $fail, PHP_EOL);
exit($fail === 0 ? 0 : 1);
