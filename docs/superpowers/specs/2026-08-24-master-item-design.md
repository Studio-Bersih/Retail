# Master Item — Design

**Date:** 2026-08-24
**Status:** Awaiting review
**Scope:** Master Item and the stock foundation it requires.
**Not in scope:** Sales, reporting, purchasing, the POS screens themselves.

## 1. Purpose

Replace a single-company item master that has run three years in production
(~8 GB MySQL, 56+ outlets, ~2,285 items, ~158k stock rows) with a model that
supports **many companies, each owning its own catalog, outlets and stock**.

This is a rewrite, not a migration of the old schema. The legacy schema informs
it but does not constrain it.

## 2. Decisions taken

Each of these was decided during brainstorming and is settled unless this
document is revised.

| # | Decision |
| - | -------- |
| 1 | **Shared tables with a `perusahaan_id` discriminator.** One physical schema, not a database or schema per tenant. |
| 2 | **Catalog, outlets and stock are per-company.** Company A's products are invisible to Company B. |
| 3 | **Lookups split.** `pos_satuan` and `pos_region` are global; `pos_jenis`, `pos_merek`, `pos_supplier` are per-company. |
| 4 | **One unit per product.** Box and Pcs are *separate products*. |
| 5 | **Konversi is a stock movement**, not a unit conversion: it consumes one product and produces another, against a stored recipe. |
| 6 | **Stock is an append-only ledger with a cached balance.** The balance is written in the same transaction as the movement. |
| 7 | **Selling into negative stock is allowed but requires a reason**, captured at the moment of sale. The negative balance is itself the pending-receipt list. |
| 8 | **Price is keyed by product + level + region**, region nullable. Levels are named per company. |
| 9 | **Region attaches to price and outlet, never to the product.** One `kode` serves every region. |
| 10 | **Non-physical charges are not products.** Ongkir, biaya admin and service charge live on the transaction header. |

## 3. Naming

Governed by `CLAUDE.md`. Summary: `lower_snake_case`; Indonesian domain nouns;
surrogate `id` keys; foreign keys never point at natural string keys; money is
`DECIMAL(15,2)`; parent/child document tables are `pos_rekap_[feature]` and
`pos_detail_[feature]`. The word `delta` is not used — a signed change is
`jumlah`, a resulting balance is `stok_akhir`.

## 4. Schema

### 4.1 Organisation

```sql
sy_perusahaan
  id            BIGINT UNSIGNED PK
  kode          VARCHAR(10)   UNIQUE
  nama          VARCHAR(150)
  is_active     BOOLEAN       DEFAULT 1
  created_at, updated_at

pos_region                          -- global
  id            BIGINT UNSIGNED PK
  kode          VARCHAR(10)   UNIQUE
  nama          VARCHAR(100)
  created_at, updated_at

pos_satuan                          -- global
  id            BIGINT UNSIGNED PK
  kode          VARCHAR(10)   UNIQUE     -- pcs, box, kg
  nama          VARCHAR(50)
  created_at, updated_at

sy_outlet
  id            BIGINT UNSIGNED PK
  perusahaan_id -> sy_perusahaan
  kode          VARCHAR(10)
  nama          VARCHAR(100)
  region_id?    -> pos_region
  tipe          ENUM('outlet','gudang')
  alamat?       TEXT
  is_active     BOOLEAN DEFAULT 1
  created_at, updated_at
  UNIQUE(perusahaan_id, kode)
  INDEX(perusahaan_id, region_id)

sy_karyawan
  id            BIGINT UNSIGNED PK
  perusahaan_id -> sy_perusahaan
  nip           VARCHAR(20)
  nama          VARCHAR(150)
  outlet_id?    -> sy_outlet
  peran         ENUM('staff','supervisor','auditor','admin')
  is_active     BOOLEAN DEFAULT 1
  created_at, updated_at
  UNIQUE(perusahaan_id, nip)
```

`tipe` replaces the legacy `FUNGSI` (Utama/Gudang/Cabang) crossed with
`TIPE` (Kitchen/Outlet/FLC). The only distinction the software needs is where
"Item Masuk from the company" originates. An FLC — Factory Logistic Center — is
a `gudang`.

### 4.2 Per-company lookups

```sql
pos_jenis                           -- product category
  id, perusahaan_id, nama VARCHAR(100), keterangan? TEXT, created_at, updated_at
  UNIQUE(perusahaan_id, nama)

pos_merek
  id, perusahaan_id, nama VARCHAR(100), keterangan? TEXT, created_at, updated_at
  UNIQUE(perusahaan_id, nama)

pos_supplier
  id, perusahaan_id, kode VARCHAR(20), nama VARCHAR(255),
  telepon? VARCHAR(30), alamat? TEXT, is_active BOOLEAN DEFAULT 1,
  created_at, updated_at
  UNIQUE(perusahaan_id, kode)
```

`pos_supplier` replaces both legacy supplier tables. Banking details are
deferred to a purchasing module.

### 4.3 Product master

```sql
pos_master_produk
  id              BIGINT UNSIGNED PK
  perusahaan_id   -> sy_perusahaan
  kode            VARCHAR(30)
  nama            VARCHAR(150)
  satuan_id       -> pos_satuan
  jenis_id?       -> pos_jenis
  merek_id?       -> pos_merek
  supplier_id?    -> pos_supplier          -- default only
  barcode?        VARCHAR(50)
  berat_gram?     INT
  deskripsi?      TEXT
  gambar_url?     TEXT
  status          ENUM('aktif','tidak_aktif','diskontinu')
  created_by_id?  -> sy_karyawan
  updated_by_id?  -> sy_karyawan
  created_at, updated_at

  UNIQUE(perusahaan_id, kode)
  UNIQUE(perusahaan_id, barcode)
  INDEX(perusahaan_id, nama)
  INDEX(perusahaan_id, jenis_id)
  INDEX(perusahaan_id, merek_id)
  INDEX(perusahaan_id, status)
```

`supplier_id` is a default for convenience. The supplier that actually
delivered is recorded per receipt, because stock can arrive from the company or
direct from a supplier.

### 4.4 Konversi recipe

```sql
pos_master_konversi
  id                BIGINT UNSIGNED PK
  perusahaan_id     -> sy_perusahaan
  produk_asal_id    -> pos_master_produk     -- Mineral Water (Box)
  jumlah_asal       INT                      -- 1
  produk_tujuan_id  -> pos_master_produk     -- Mineral Water (Pcs)
  jumlah_tujuan     INT                      -- 12
  is_active         BOOLEAN DEFAULT 1
  created_at, updated_at

  UNIQUE(perusahaan_id, produk_asal_id, produk_tujuan_id)
  CHECK (jumlah_asal > 0 AND jumlah_tujuan > 0)
  CHECK (produk_asal_id <> produk_tujuan_id)
```

Both products must belong to `perusahaan_id`; enforced in application code,
since MySQL cannot express a cross-row tenant check as a constraint.

Recipes are directional. Re-packing 12 Pcs back into 1 Box is a second row.

### 4.5 Pricing

```sql
pos_level_harga
  id, perusahaan_id, nama VARCHAR(50), sequence SMALLINT,
  is_default BOOLEAN DEFAULT 0, created_at, updated_at
  UNIQUE(perusahaan_id, nama)
  -- e.g. Retail / GoFood / Transfer Pabrik

pos_harga_produk
  id              BIGINT UNSIGNED PK
  perusahaan_id   -> sy_perusahaan
  produk_id       -> pos_master_produk
  level_harga_id  -> pos_level_harga
  region_id?      -> pos_region             -- NULL = company-wide
  region_key      BIGINT UNSIGNED AS (COALESCE(region_id, 0)) STORED
  harga           DECIMAL(15,2)
  updated_by_id?  -> sy_karyawan
  created_at, updated_at

  UNIQUE(produk_id, level_harga_id, region_key)
  INDEX(perusahaan_id, produk_id)
```

`region_key` exists because MySQL treats `NULL`s as distinct inside a `UNIQUE`
index. Without it, two company-wide prices for the same product and level would
both be accepted and the resolver would pick one arbitrarily.

**Resolution.** Given a product, a price level and the outlet:

1. Row matching the outlet's `region_id`.
2. Otherwise the row with `region_id IS NULL`.
3. Otherwise **no price — block the sale.** Never fall back to zero.

A company with one flat price writes one row per product and never encounters
levels or regions. Worked example for product `11001`:

```
11001  Retail           NULL   9000    company-wide retail
11001  GoFood           NULL  13000    absorbs platform commission
11001  Transfer Pabrik  NULL   5000    factory -> outlet
11001  Retail           KLM   11000    Kalimantan overrides retail
```

### 4.6 Stock

```sql
pos_stok_outlet                     -- cached balance
  id            BIGINT UNSIGNED PK
  perusahaan_id -> sy_perusahaan
  outlet_id     -> sy_outlet
  produk_id     -> pos_master_produk
  stok          INT NOT NULL DEFAULT 0
  updated_at
  UNIQUE(outlet_id, produk_id)
  INDEX(perusahaan_id, produk_id)
  INDEX(outlet_id, stok)            -- serves the stok < 0 pending list

pos_stok_mutasi                     -- append-only ledger, the truth
  id               BIGINT UNSIGNED PK
  perusahaan_id    -> sy_perusahaan
  outlet_id        -> sy_outlet
  produk_id        -> pos_master_produk
  jumlah           INT NOT NULL           -- signed change
  stok_akhir       INT NOT NULL           -- balance after this row
  tipe             ENUM('masuk','keluar','transfer','konversi',
                        'retail','retur','penyesuaian')
  rekap_tipe?      VARCHAR(20)            -- 'masuk','konversi',...
  rekap_id?        BIGINT UNSIGNED        -- header row in that document
  supplier_id?     -> pos_supplier        -- masuk only
  harga_pokok?     DECIMAL(15,2)          -- masuk only: real unit cost
  outlet_lawan_id? -> sy_outlet           -- transfer: the other end
  alasan_minus?    ENUM('belum_input','salah_hitung',
                        'retur_belum_proses','lainnya')
  catatan?         VARCHAR(255)
  karyawan_id      -> sy_karyawan
  created_at

  INDEX(outlet_id, produk_id, id)
  INDEX(perusahaan_id, created_at)
  INDEX(rekap_tipe, rekap_id)
```

**Direction is carried by the sign of `jumlah`, not by the type.** Konversi is
two rows sharing a `rekap_id`: `-1` on the Box product, `+12` on the Pcs
product. Transfer is two rows sharing a `rekap_id` at two outlets.

**`stok_akhir` on every row makes drift detectable.** Replaying `jumlah` for a
product must land on the same number. Nothing in the legacy schema can be
checked against anything.

**Writes.** The movement insert and the balance update happen in one
transaction:

```sql
INSERT INTO pos_stok_outlet (..., stok) VALUES (..., :jumlah)
  ON DUPLICATE KEY UPDATE stok = stok + :jumlah;
```

The unique key provides the row lock, so concurrent cashiers on the same
product cannot interleave into a wrong balance.

**Authority.** `penyesuaian` is the only type that sets an absolute quantity;
the server computes `jumlah` from the current balance and rejects the write
unless `sy_karyawan.peran` is `auditor` or `admin`. It is never available to
`staff`.

**Selling into negative.** A `retail` movement that would drive `stok` below
zero is rejected unless `alasan_minus` is present. `catatan` is optional
alongside it. The pending-receipt list is:

```sql
SELECT * FROM pos_stok_outlet WHERE outlet_id = ? AND stok < 0
```

It requires no separate table, no manual close, and clears itself when the
receipt is filed.

**Worked example — the shift handover this replaces.** Outlet A, product
`11001`, stock 0. A supplier delivers at night; Staff A does not record it.
Next morning Staff B finds one on the rack and a customer wants it:

```
tipe=retail   jumlah=-1  stok_akhir=-1  karyawan=B
              alasan_minus=belum_input
              catatan="supplier datang malam, barang ada di rak"

tipe=masuk    jumlah=+1  stok_akhir=0   karyawan=A
              supplier_id=PT_X  harga_pokok=5000
```

The `-1` appears on the outlet's pending list the instant it happens and
disappears when Staff A files the Masuk. An auditor can see who authorised the
oversell and who closed it — neither of which is answerable today.

This removes `PRE_ADJUSTMENT`, `HISTORY_PRE_ADJUSTMENT` and
`HISTORY_ADJUSTMENT` entirely. The mechanism they emulated is now just data.

### 4.7 Document tables — contract only

Specified here so the ledger's `rekap_tipe` / `rekap_id` have a defined target.
**Implementation belongs to the next module, not this one.**

```sql
pos_rekap_masuk     id, perusahaan_id, outlet_id, nomor, tanggal,
                    supplier_id?, karyawan_id, catatan?,
                    status ENUM('draft','posted','void'), timestamps
                    UNIQUE(perusahaan_id, nomor)
pos_detail_masuk    id, rekap_id, produk_id, jumlah, harga_pokok?
                    INDEX(rekap_id)

pos_rekap_keluar    / pos_detail_keluar     same shape, no supplier
pos_rekap_transfer  / pos_detail_transfer   + outlet_tujuan_id on the rekap
pos_rekap_konversi  / pos_detail_konversi   detail carries konversi_id,
                                            produk_asal_id, jumlah_asal,
                                            produk_tujuan_id, jumlah_tujuan
pos_rekap_retail    / pos_detail_retail     sales; header carries ongkir,
                                            biaya_admin, service_charge
```

Stock moves only when a document is `posted`. A `void` reverses by writing
opposing movements — never by deleting ledger rows.

## 5. Dropped from the legacy schema

| Legacy | Fate | Why |
| ------ | ---- | --- |
| `HARGA` | → `pos_harga_produk` | one price cannot express levels or regions |
| `REGION` on product | → price and outlet | `UNIQUE(KODE)` plus `REGION` forced one product into one region and pushed toward duplicate codes per island |
| `SUPPLIER` on product | → default + per-receipt | the delivering supplier is a fact about the receipt |
| `KATEGORI_MARKETING` | dropped | internal bucket, meaningless to another company |
| `BENEFIT_PRODUK` | dropped | marketing copy |
| `TIPE` | dropped | no foreign key, no referenced table, no discoverable meaning |
| `CREATED_BY VARCHAR(5)` | → FK to `sy_karyawan` | 5 chars here, 6 for `NIP` in stock — same concept, two widths |
| `STOK_PESANAN` | dropped | see open question 3 |
| `PRE_ADJUSTMENT`, both `HISTORY_*` | dropped | superseded by the ledger |
| `FULLTEXT (KODE, KODE_OUTLET)` | dropped | serves no lookup the application performs |

Defects in the legacy tables that this design does not reproduce:

- **`BERAT SMALLINT` overflows at 32,767 g.** Anything above ~32 kg breaks
  silently. Now `INT`.
- **`STATUS` mixed two axes** — `Aktif`/`Tidak Aktif` is availability,
  `Kontinu`/`Diskontinu` is lifecycle — and `' Diskontinu'` carried a leading
  space, so comparisons against it fail silently.
- **`KODE VARCHAR(20)` joined to `VARCHAR(15)`**, so the join key was
  truncatable. Stock now joins on `produk_id`.
- **`pos_stok_outlet` had no unique key on (product, outlet)**, so duplicate
  balance rows are possible today.
- **Lookups joined by string value with `ON UPDATE CASCADE`**, so renaming a
  brand rewrote every product row.

## 6. Deferred

Additive; none of them require reworking what is specified above.

- Multiple barcodes per product
- Product availability per outlet (which outlets may carry which products)
- Scheduled price changes and a price audit trail — the sale line snapshots the
  price charged, so history is reconstructable from transactions
- Supplier banking details, purchase orders
- Stock reservation
- Full role and permission model beyond `sy_karyawan.peran`
- Per-company `alasan_minus` reason lists
- `RANGE` partitioning of `pos_stok_mutasi` on `created_at`

## 7. Scale

At current volume — 56 outlets, ~2,285 products — `pos_stok_mutasi` grows on
the order of 10M rows per year, roughly 1–2 GB with indexes, per company. That
is comfortable for MySQL with the indexes above. Archive by year before
reaching for partitioning; partitioning requires the partition key in every
unique key and complicates the primary key, so it is not worth doing in v1.

`pos_stok_outlet` stays small: one row per outlet × product actually stocked.

## 8. Open questions

1. **Table name collision.** Marmyadose already has a `pos_master_produk` — a
   different table with different columns, serving Nick Cell / Layescent out of
   the `dao` database, with three branches as hardcoded columns
   (`STOK_ITEM`, `STOK_ITEM_SECOND`, `STOK_ITEM_THIRD`). This design reuses
   several of those names. **Recommendation: give the new POS its own
   database.** The alternative is prefixing every table, which fights the
   naming convention. *Blocking before any migration is written.*

2. **Region scope.** `pos_region` is global here, per the decision that
   universal lookups are shared. But the live `pos_region` holds 22
   single-character codes, which reads like internal zoning rather than
   geography. If companies need private regions, add a nullable
   `perusahaan_id` (null = global) — one column, no data migration.

3. **Stock reservation.** Legacy `STOK_PESANAN` held stock reserved against
   orders. Omitted rather than guessed at. Needed in v1?

4. **Column language.** Indonesian domain nouns with English structural terms,
   all lower snake case — a deliberate break from the legacy `UPPERCASE`.
   Confirm before the first migration.

5. **`sy_karyawan` and authentication.** This design assumes employees live in
   the new schema. Marmyadose has its own `users` table and a separate
   `pos_users`. How these relate is unresolved and affects login.
