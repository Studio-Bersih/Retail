<?php
/**
 * Retail POS — subscription and entitlement checks.
 *
 *   php database/06_subscription_check.php
 *
 * Every test runs inside a transaction and is rolled back, so this leaves no
 * rows behind. Half of them are expected to FAIL — that is the point: the
 * trigger backstop only means something if it actually refuses things.
 *
 * Run after 01_schema.sql, 05_subscription.sql and faker.php.
 */

declare(strict_types=1);
date_default_timezone_set('Asia/Jakarta');

$pdo = new PDO('mysql:host=127.0.0.1;port=3306;dbname=retail;charset=utf8mb4', 'root', 'root', [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
]);

$pass = 0; $fail = 0;

function ok(string $label, string $detail = ''): void {
    global $pass; $pass++;
    printf("  PASS  %-58s %s%s", $label, $detail, PHP_EOL);
}
function bad(string $label, string $detail = ''): void {
    global $fail; $fail++;
    printf("  FAIL  %-58s %s%s", $label, $detail, PHP_EOL);
}

/** The callable must SUCCEED. */
function expectOk(PDO $pdo, string $label, callable $fn): void {
    $pdo->beginTransaction();
    try { $detail = $fn($pdo) ?? ''; $pdo->rollBack(); ok($label, (string) $detail); }
    catch (Throwable $e) { $pdo->rollBack(); bad($label, '-> unexpectedly refused: ' . trim($e->getMessage())); }
}

/** The callable must be REFUSED, with $needle somewhere in the message. */
function expectRefused(PDO $pdo, string $label, string $needle, callable $fn): void {
    $pdo->beginTransaction();
    try {
        $fn($pdo);
        $pdo->rollBack();
        bad($label, '-> was ACCEPTED but should have been refused');
    } catch (Throwable $e) {
        $pdo->rollBack();
        $msg = trim($e->getMessage());
        if (stripos($msg, $needle) !== false) {
            ok($label, '-> ' . substr(preg_replace('/\s+/', ' ', $msg), 0, 72));
        } else {
            bad($label, '-> refused for the WRONG reason: ' . substr($msg, 0, 90));
        }
    }
}

$pid   = (int) $pdo->query("SELECT id FROM sy_perusahaan WHERE kode='ACME'")->fetch()['id'];
$state = $pdo->query("SELECT * FROM subscription WHERE perusahaan_id = $pid")->fetch();

echo PHP_EOL, "Company under test: {$state['perusahaan']}", PHP_EOL;
printf("  outlets  %d / %d used   staff %d / %d used   expires %s (%d days)%s%s",
    $state['outlet_terpakai'], $state['kuota_outlet'],
    $state['karyawan_terpakai'], $state['kuota_karyawan'],
    $state['berlaku_sampai'], $state['sisa_hari'], PHP_EOL, PHP_EOL);

echo "--- quota gate: staff ---", PHP_EOL;

expectOk($pdo, 'hiring while seats remain is allowed', function (PDO $p) use ($pid) {
    $p->exec("INSERT INTO sy_karyawan (perusahaan_id,nip,nama,peran)
              VALUES ($pid,'CHK01','Uji Coba','staff')");
    return '-> 1 seat consumed';
});

expectRefused($pdo, 'hiring past the quota is refused', 'Kuota karyawan habis', function (PDO $p) use ($pid) {
    // squeeze the quota down to exactly what is in use, then hire one more
    $p->exec("UPDATE sy_subscription
                 SET kuota_karyawan = (SELECT COUNT(*) FROM sy_karyawan
                                       WHERE perusahaan_id=$pid AND is_active=1)
               WHERE perusahaan_id=$pid");
    $p->exec("INSERT INTO sy_karyawan (perusahaan_id,nip,nama,peran)
              VALUES ($pid,'CHK02','Satu Lagi','staff')");
});

expectOk($pdo, 'hiring INACTIVE staff is allowed even at the quota', function (PDO $p) use ($pid) {
    $p->exec("UPDATE sy_subscription
                 SET kuota_karyawan = (SELECT COUNT(*) FROM sy_karyawan
                                       WHERE perusahaan_id=$pid AND is_active=1)
               WHERE perusahaan_id=$pid");
    $p->exec("INSERT INTO sy_karyawan (perusahaan_id,nip,nama,peran,is_active)
              VALUES ($pid,'CHK03','Belum Aktif','staff',0)");
    return '-> inactive rows do not consume a seat';
});

echo PHP_EOL, "--- quota gate: outlets ---", PHP_EOL;

expectRefused($pdo, 'opening an outlet past the quota is refused', 'Kuota outlet habis', function (PDO $p) use ($pid) {
    $p->exec("UPDATE sy_subscription
                 SET kuota_outlet = (SELECT COUNT(*) FROM sy_outlet
                                     WHERE perusahaan_id=$pid AND is_active=1)
               WHERE perusahaan_id=$pid");
    $p->exec("INSERT INTO sy_outlet (perusahaan_id,kode,nama,tipe)
              VALUES ($pid,'CHKO','Outlet Uji','outlet')");
});

echo PHP_EOL, "--- reactivation and the escape route (spec §6.4) ---", PHP_EOL;

expectRefused($pdo, 'reactivating staff while at the quota is refused', 'tidak bisa aktifkan', function (PDO $p) use ($pid) {
    $id = (int) $p->query("SELECT id FROM sy_karyawan WHERE perusahaan_id=$pid AND is_active=1 LIMIT 1")->fetch()['id'];
    $p->exec("UPDATE sy_karyawan SET is_active=0 WHERE id=$id");
    $p->exec("UPDATE sy_subscription
                 SET kuota_karyawan = (SELECT COUNT(*) FROM sy_karyawan
                                       WHERE perusahaan_id=$pid AND is_active=1)
               WHERE perusahaan_id=$pid");
    $p->exec("UPDATE sy_karyawan SET is_active=1 WHERE id=$id");
});

expectOk($pdo, 'DEACTIVATING is never blocked, even when over quota', function (PDO $p) use ($pid) {
    $p->exec("UPDATE sy_subscription SET kuota_karyawan = 1 WHERE perusahaan_id=$pid");
    $id = (int) $p->query("SELECT id FROM sy_karyawan WHERE perusahaan_id=$pid AND is_active=1 LIMIT 1")->fetch()['id'];
    $p->exec("UPDATE sy_karyawan SET is_active=0 WHERE id=$id");
    return '-> this is how an over-quota company digs itself out';
});

expectOk($pdo, 'editing an over-quota company\'s staff is not blocked', function (PDO $p) use ($pid) {
    $p->exec("UPDATE sy_subscription SET kuota_karyawan = 1 WHERE perusahaan_id=$pid");
    $id = (int) $p->query("SELECT id FROM sy_karyawan WHERE perusahaan_id=$pid AND is_active=1 LIMIT 1")->fetch()['id'];
    $p->exec("UPDATE sy_karyawan SET nama='Nama Baru' WHERE id=$id");
    return '-> existing 173 keep working on a 1-seat quota';
});

echo PHP_EOL, "--- bootstrapping (spec §6.5) ---", PHP_EOL;

expectRefused($pdo, 'a company with NO subscription cannot create an outlet', 'Kuota outlet habis', function (PDO $p) {
    $p->exec("INSERT INTO sy_perusahaan (kode,nama) VALUES ('CHKX','PT Tanpa Langganan')");
    $new = (int) $p->lastInsertId();
    $p->exec("INSERT INTO sy_outlet (perusahaan_id,kode,nama,tipe) VALUES ($new,'O01','Outlet','outlet')");
});

expectOk($pdo, 'the same company CAN once its subscription exists', function (PDO $p) {
    $p->exec("INSERT INTO sy_perusahaan (kode,nama) VALUES ('CHKY','PT Dengan Langganan')");
    $new = (int) $p->lastInsertId();
    $p->exec("INSERT INTO sy_subscription (perusahaan_id,berlaku_sampai,kuota_outlet,kuota_karyawan)
              VALUES ($new, DATE_ADD(CURDATE(), INTERVAL 14 DAY), 1, 3)");
    $p->exec("INSERT INTO sy_outlet (perusahaan_id,kode,nama,tipe) VALUES ($new,'O01','Outlet','outlet')");
    return '-> trial: 1 outlet, 3 staff, 14 days';
});

echo PHP_EOL, "--- payment document integrity ---", PHP_EOL;

expectRefused($pdo, 'a line whose subtotal does not match is refused', 'ck_detail_payment_subtotal', function (PDO $p) use ($pid) {
    $rid = (int) $p->query("SELECT id FROM sy_rekap_payment WHERE perusahaan_id=$pid LIMIT 1")->fetch()['id'];
    $p->exec("INSERT INTO sy_detail_payment
                (perusahaan_id,rekap_id,jenis,keterangan,jumlah,bulan,harga_per_bulan,subtotal)
              VALUES ($pid,$rid,'outlet','Salah hitung',5,12,50000.00, 999.00)");
});

expectOk($pdo, 'a line whose subtotal is correct is accepted', function (PDO $p) use ($pid) {
    $rid = (int) $p->query("SELECT id FROM sy_rekap_payment WHERE perusahaan_id=$pid LIMIT 1")->fetch()['id'];
    $p->exec("INSERT INTO sy_detail_payment
                (perusahaan_id,rekap_id,jenis,keterangan,jumlah,bulan,harga_per_bulan,subtotal)
              VALUES ($pid,$rid,'outlet','Benar',5,12,50000.00, 3000000.00)");
    return '-> 5 x 12 x 50.000 = 3.000.000';
});

expectRefused($pdo, 'a period that ends before it starts is refused', 'ck_payment_periode', function (PDO $p) use ($pid) {
    $p->exec("INSERT INTO sy_rekap_payment
                (perusahaan_id,nomor,tanggal,periode_mulai,periode_sampai,total,status)
              VALUES ($pid,'CHK-REV',CURDATE(),'2027-01-01','2026-01-01',100,'draft')");
});

expectRefused($pdo, 'two prices for the same jenis are refused', 'uq_pricing_jenis', function (PDO $p) {
    $p->exec("INSERT INTO sy_pricing (jenis,nama,harga_per_bulan) VALUES ('outlet','Duplikat',1)");
});

expectRefused($pdo, 'a negative quota is refused', 'ck_subscription_kuota', function (PDO $p) use ($pid) {
    $p->exec("UPDATE sy_subscription SET kuota_outlet = -1 WHERE perusahaan_id=$pid");
});

echo PHP_EOL, "--- the renewal transaction (spec §7) ---", PHP_EOL;

expectOk($pdo, 'marking a payment lunas extends the term and sets the quota', function (PDO $p) use ($pid) {
    $p->exec("INSERT INTO sy_rekap_payment
                (perusahaan_id,nomor,tanggal,periode_mulai,periode_sampai,total,status,metode,dicatat_oleh)
              VALUES ($pid,'CHK-RENEW',CURDATE(),
                      DATE_ADD(CURDATE(), INTERVAL 1 DAY),
                      DATE_ADD(CURDATE(), INTERVAL 366 DAY),
                      4200000.00,'draft','transfer BCA','Uji')");
    $rid = (int) $p->lastInsertId();
    $p->exec("INSERT INTO sy_detail_payment
                (perusahaan_id,rekap_id,jenis,keterangan,jumlah,bulan,harga_per_bulan,subtotal) VALUES
                ($pid,$rid,'outlet','Outlet / cabang',5,12,50000.00,3000000.00),
                ($pid,$rid,'karyawan','Staff',20,12,5000.00,1200000.00)");
    // the one transaction that both marks it paid and moves the entitlement
    $p->exec("UPDATE sy_rekap_payment SET status='lunas' WHERE id=$rid");
    $p->exec("UPDATE sy_subscription s
                JOIN sy_rekap_payment r ON r.id=$rid
                 SET s.berlaku_sampai = r.periode_sampai,
                     s.kuota_outlet   = (SELECT jumlah FROM sy_detail_payment
                                          WHERE rekap_id=$rid AND jenis='outlet'),
                     s.kuota_karyawan = (SELECT jumlah FROM sy_detail_payment
                                          WHERE rekap_id=$rid AND jenis='karyawan')
               WHERE s.perusahaan_id=$pid");
    $r = $p->query("SELECT berlaku_sampai, kuota_outlet, kuota_karyawan
                    FROM sy_subscription WHERE perusahaan_id=$pid")->fetch();
    if ($r['kuota_outlet'] != 5 || $r['kuota_karyawan'] != 20) {
        throw new RuntimeException('quota did not move: ' . json_encode($r));
    }
    return "-> term {$r['berlaku_sampai']}, quota {$r['kuota_outlet']}/{$r['kuota_karyawan']}";
});

echo PHP_EOL, "--- the login gate (spec §6.1) ---", PHP_EOL;

expectOk($pdo, 'an expired term reads as TERKUNCI, and the term is inclusive', function (PDO $p) use ($pid) {
    $p->exec("UPDATE sy_subscription SET berlaku_sampai = CURDATE() WHERE perusahaan_id=$pid");
    $today = $p->query("SELECT status FROM subscription WHERE perusahaan_id=$pid")->fetch()['status'];
    $p->exec("UPDATE sy_subscription SET berlaku_sampai = DATE_SUB(CURDATE(), INTERVAL 1 DAY) WHERE perusahaan_id=$pid");
    $past = $p->query("SELECT status FROM subscription WHERE perusahaan_id=$pid")->fetch()['status'];
    if ($today === 'TERKUNCI') throw new RuntimeException('last day should still be usable');
    if ($past !== 'TERKUNCI')  throw new RuntimeException('yesterday should be locked, got ' . $past);
    return "-> last day = '$today', day after = '$past'";
});

echo PHP_EOL, "--- nothing was left behind ---", PHP_EOL;
$after = $pdo->query("SELECT
    (SELECT COUNT(*) FROM sy_perusahaan)     AS perusahaan,
    (SELECT COUNT(*) FROM sy_outlet)         AS outlet,
    (SELECT COUNT(*) FROM sy_karyawan)       AS karyawan,
    (SELECT COUNT(*) FROM sy_rekap_payment)  AS payment,
    (SELECT COUNT(*) FROM sy_detail_payment) AS payment_line")->fetch();
foreach ($after as $k => $v) printf("  %-14s %s%s", $k, $v, PHP_EOL);

printf('%s%d passed, %d failed%s', PHP_EOL, $pass, $fail, PHP_EOL);
exit($fail === 0 ? 0 : 1);
