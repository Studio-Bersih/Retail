# Retail POS — backend implementation guide

Everything the backend must know to build against the `retail` database.

**This repository is the SvelteKit frontend.** The database and this guide were
built here first; the backend lives elsewhere (Marmyadose/Laravel today, Bun.js
later). Take this document with you.

The schema is defined by three files in git history at `database/`:
`01_schema.sql`, `05_subscription.sql`, `04_views.sql`. Two design specs sit in
`docs/superpowers/specs/`. Recover them with `git log --all -- database/`.

---

## 1. Connection

The POS owns its own MySQL database, `retail`, separate from Marmyadose's `dao`.
`dao` contains an unrelated `pos_master_produk` serving Nick Cell / Layescent —
the two must never be mixed.

```php
// config/database.php
'retail' => [
    'driver'    => 'mysql',
    'host'      => env('RETAIL_DB_HOST', '127.0.0.1'),
    'port'      => env('RETAIL_DB_PORT', '3306'),
    'database'  => env('RETAIL_DB_DATABASE', 'retail'),
    'username'  => env('RETAIL_DB_USERNAME'),
    'password'  => env('RETAIL_DB_PASSWORD'),
    'charset'   => 'utf8mb4',
    'collation' => 'utf8mb4_0900_ai_ci',
    'strict'    => true,
],
```

Every model in this module sets `protected $connection = 'retail';`.
Migrations run with `--database=retail`.

**No cross-database joins. Ever.** MySQL permits them on one server, but they
couple the two systems and would block the move to Bun.js, which takes this
database over whole. Anything this module needs, it owns.

---

## 2. The rules the database enforces for you

Five triggers refuse bad writes with `SQLSTATE 45000`. Catch MySQL error
**1644** and translate the message. Do not rely on the trigger for the user
experience — check first so you can give a useful message — but never assume
the check was enough.

| Trigger | Refuses |
| ------- | ------- |
| `trg_kuota_outlet_insert` / `_update` | an outlet beyond the paid quota |
| `trg_kuota_karyawan_insert` / `_update` | a staff member beyond the paid quota |
| `trg_pecahan_mutasi` | a fractional quantity on a whole-only unit |

Other errors worth handling by code rather than by string:

| Code | Meaning |
| ---- | ------- |
| 1644 | a business rule refused the write — the message is in Indonesian and safe to show |
| 1062 | duplicate key — a `kode`, `barcode`, or a second company-wide price |
| 1452 | foreign key — you referenced something that does not exist |
| 3819 | CHECK constraint — a bad conversion recipe, a negative quota, a mis-computed payment line |

---

## 3. Invariants the database CANNOT enforce

These are yours. Nothing will catch you if you get them wrong.

### 3.1 A stock movement and its balance are one transaction

Never write one without the other.

```php
DB::connection('retail')->transaction(function () use ($outletId, $produkId, $jumlah, ...) {
    DB::connection('retail')->statement(
        'INSERT INTO pos_stok_outlet (perusahaan_id, outlet_id, produk_id, stok)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE stok = stok + VALUES(stok)',
        [$perusahaanId, $outletId, $produkId, $jumlah]
    );

    $stokAkhir = DB::connection('retail')->scalar(
        'SELECT stok FROM pos_stok_outlet WHERE outlet_id = ? AND produk_id = ?',
        [$outletId, $produkId]
    );

    DB::connection('retail')->table('pos_stok_mutasi')->insert([
        'perusahaan_id' => $perusahaanId,
        'outlet_id'     => $outletId,
        'produk_id'     => $produkId,
        'jumlah'        => $jumlah,       // signed
        'stok_akhir'    => $stokAkhir,    // the balance AFTER this row
        'tipe'          => $tipe,
        'karyawan_id'   => $karyawanId,
    ]);
});
```

The `UNIQUE(outlet_id, produk_id)` key provides the row lock, so two cashiers
selling the same product cannot interleave into a wrong balance. **Read the
balance back inside the transaction** — do not compute it in PHP from a value
you read earlier.

`stok_akhir` must be the balance *at that moment in time*. If you ever backfill
movements, order them by `created_at` and recompute; a `stok_akhir` that
disagrees with a chronological replay is corruption, and the drift check below
will find it.

### 3.2 Direction is the sign of `jumlah`, not the `tipe`

- Konversi is **two rows** sharing one `rekap_id`: `-1` on the Box product,
  `+12` on the Pcs product, same outlet.
- Transfer is **two rows** sharing one `rekap_id` at two outlets, each carrying
  `outlet_lawan_id` pointing at the other end.

### 3.3 Selling into negative requires a reason

A `retail` movement that drives the balance below zero must carry
`alasan_minus`. The database does not enforce this — you must. The pending
receipt list is then free:

```sql
SELECT * FROM pos_stok_outlet WHERE outlet_id = ? AND stok < 0
```

No separate table, no manual close. It clears itself when the receipt is filed.

### 3.4 `penyesuaian` is privileged

It is the only type that sets an *absolute* quantity: compute `jumlah` from the
current balance server-side, and reject the write unless
`sy_karyawan.peran` is `auditor` or `admin`. Never expose it to `staff`.

### 3.5 Both products in a conversion must belong to the same company

MySQL cannot express a cross-row tenant check. Validate it.

### 3.6 Every company-scoped query filters on `perusahaan_id`

Even where it is derivable through a parent. Use a global scope so it cannot be
forgotten.

---

## 4. Resolving a price

Given a product, a price level and an outlet:

1. the row matching the outlet's `region_id`,
2. otherwise the row with `region_id IS NULL`,
3. otherwise **no price — block the sale.** Never fall back to zero.

All three steps in one indexed lookup:

```sql
SELECT harga
  FROM pos_harga_produk
 WHERE produk_id = :produk
   AND level_harga_id = :level
   AND region_key IN (:outlet_region_id, 0)   -- 0 means company-wide
 ORDER BY region_key DESC                     -- a regional row beats the fallback
 LIMIT 1
```

`region_key` is a stored generated column, `COALESCE(region_id, 0)`. It exists
because MySQL treats `NULL`s as distinct inside a `UNIQUE` index — without it,
two company-wide prices for the same product and level would both be accepted
and the resolver would pick one arbitrarily.

**Snapshot the price you charged onto the sale line.** Never join back to
`pos_harga_produk` to reprint an old receipt.

Measured: the full catalogue for one outlet — product, unit, resolved price and
stock across four tables — is **0.446 ms** for 492 products. These joins are
not the expensive kind. What *is* expensive is an N+1: looping products and
querying the price per product turns one query into 492.

---

## 5. Quantities

`jumlah`, `stok_akhir`, `stok`, `jumlah_asal` and `jumlah_tujuan` are
`DECIMAL(15,3)` — gram and millilitre precision.

**Never bind them as PHP floats in accumulating arithmetic.** Use strings or a
decimal library, or carry integers scaled by 1000 and render on write. The
drift check compares an exact MySQL `DECIMAL` sum against the cached balance;
float error makes it report drift that is not there.

Whether a quantity *may* be fractional is `pos_satuan.is_pecahan` — a property
of the unit, never of a product. Divisible today: `kg` and `liter`. Check it
before you write, so you can say *"Satuan pcs tidak bisa 1,5"* instead of
letting error 1644 reach the user.

Display: trim trailing zeros. `12.000` should read as `12 botol`, `1.500` as
`1.5 kg`.

---

## 6. Subscription and access

### 6.1 Login gate

```sql
SELECT berlaku_sampai < CURDATE() AS terkunci
  FROM sy_subscription WHERE perusahaan_id = ?
```

True → refuse authentication for **every** user of that company, including its
own admin. The term is **inclusive**: `berlaku_sampai = 2027-08-31` means they
trade all day on the 31st and are locked on 1 September.

There is no grace state. When a payment is genuinely in flight, a human moves
`berlaku_sampai` and records why in `catatan`. That is an edit, not a state.

Consequence to design around: a locked-out customer cannot see what they owe or
renew from inside the app. Renewal is out of band.

### 6.2 Quota gate

A seat is a **currently active row**. Deactivating frees it immediately.

```sql
SELECT kuota_karyawan - (SELECT COUNT(*) FROM sy_karyawan
                          WHERE perusahaan_id = ? AND is_active = 1) AS sisa
  FROM sy_subscription WHERE perusahaan_id = ?
```

Negative means over quota. **Never store that as a flag** — derived state
cannot drift.

An over-quota company (they renewed for fewer seats than they have active)
keeps working. Block `INSERT` and reactivation; **never block deactivation**,
because that is how they get back under. Never deactivate or delete a
customer's rows on their behalf.

### 6.3 Creating a company

Create the `sy_subscription` row **in the same transaction**. The quota
triggers refuse an outlet or staff insert when no subscription row exists, so a
company without one can never be given its first outlet.

### 6.4 Renewal

Mark `sy_payment_rekap.status = 'lunas'`, then extend `berlaku_sampai` and set
the quota from the payment lines — one transaction. `sy_payment_rekap` is the
truth; `sy_subscription` is a cache of it.

`sy_payment_detail.harga_per_bulan` is a **snapshot** of `sy_pricing`. Never
join to get it — raising prices must not rewrite what a customer was charged.

`sy_payment_detail.jumlah` is a seat count and is always a whole `INT`, unlike
every other `jumlah` in the schema.

### 6.5 Pricing on the landing page

`sy_pricing` is global, flat and safe to read unauthenticated. The landing page
and the renewal calculation read the same rows, so they cannot disagree.

---

## 7. Deleting is mostly impossible, by design

`sy_karyawan` is referenced with `ON DELETE RESTRICT` from `pos_stok_mutasi`
(where `karyawan_id` is `NOT NULL`), `pos_master_produk` and
`pos_harga_produk`. Any staff member who has ever touched stock **cannot be
deleted** — MySQL returns error 1451.

This is deliberate: it keeps every ledger row attributable. `is_active = 0` is
the only removal that exists. Do not write code that expects to delete people,
outlets or products.

Documents are cancelled with `status = 'batal'`, never deleted. A voided stock
document reverses by writing opposing movements — never by deleting ledger
rows.

---

## 8. Health checks worth running in production

```sql
-- 1. the cached balance must equal the ledger. Anything but 0 is a bug.
SELECT COUNT(*) FROM (
  SELECT so.id FROM pos_stok_outlet so
  JOIN pos_stok_mutasi mu ON mu.outlet_id = so.outlet_id AND mu.produk_id = so.produk_id
  GROUP BY so.id, so.stok HAVING so.stok <> SUM(mu.jumlah)) x;

-- 2. stok_akhir must equal the running total in CHRONOLOGICAL order
SELECT COUNT(*) FROM (
  SELECT stok_akhir, SUM(jumlah) OVER (
           PARTITION BY outlet_id, produk_id ORDER BY created_at, id
           ROWS UNBOUNDED PRECEDING) AS running
  FROM pos_stok_mutasi) r WHERE r.stok_akhir <> r.running;

-- 3. no oversell without a reason
SELECT COUNT(*) FROM pos_stok_mutasi
 WHERE tipe = 'retail' AND stok_akhir < 0 AND alasan_minus IS NULL;

-- 4. no adjustment written below auditor
SELECT COUNT(*) FROM pos_stok_mutasi mu
  JOIN sy_karyawan k ON k.id = mu.karyawan_id
 WHERE mu.tipe = 'penyesuaian' AND k.peran NOT IN ('auditor','admin');

-- 5. no movement mixing one company's outlet with another's product or staff
SELECT COUNT(*) FROM pos_stok_mutasi mu
  JOIN sy_outlet o ON o.id = mu.outlet_id
  JOIN pos_master_produk p ON p.id = mu.produk_id
  JOIN sy_karyawan k ON k.id = mu.karyawan_id
 WHERE o.perusahaan_id <> mu.perusahaan_id
    OR p.perusahaan_id <> mu.perusahaan_id
    OR k.perusahaan_id <> mu.perusahaan_id;
```

All five must return `0`. They ran clean against 47,466 generated movements.

---

## 9. Not built yet

The document tables are specified as a contract only and belong to the next
module. This is why `pos_stok_mutasi.rekap_tipe` / `rekap_id` carry **no
foreign key** — one column cannot reference five tables, and none of them
exist.

```
pos_masuk_rekap    / pos_masuk_detail        receipts
pos_keluar_rekap   / pos_keluar_detail       wastage, samples
pos_transfer_rekap / pos_transfer_detail     + outlet_tujuan_id on the rekap
pos_konversi_rekap / pos_konversi_detail     repacking
pos_retail_rekap   / pos_retail_detail       sales; header carries ongkir,
                                             biaya_admin, service_charge
```

Naming rule: `pos_[feature]_rekap` / `pos_[feature]_detail`. The feature leads
so a document's two halves sort together.

**Stock moves only when a document is `posted`.**

Also open: how `sy_karyawan` relates to Marmyadose's `users` and `pos_users` for
login. That is the one genuine seam between the two databases, and it is
unresolved. `sy_subscription.diubah_oleh` and `sy_payment_rekap.dicatat_oleh`
are plain `VARCHAR` for the same reason — the person recording a payment is
vendor staff, and there is no vendor-user table yet.

---

## 10. Reading the data by hand

Ten views resolve every `*_id` to the name it points at: `produk`,
`produk_harga`, `harga`, `konversi`, `stok`, `mutasi`, `pending_terima`,
`ringkasan_produk`, `subscription`, `payment`.

They are for reading by eye. **Application queries should hit the tables
directly** and select only the columns they need — a view that joins seven
tables is wasteful when the caller wanted two.

Column meanings are in the database itself:

```sql
SELECT table_name, column_name, column_comment
  FROM information_schema.columns
 WHERE table_schema = 'retail' AND column_comment <> '';
```
