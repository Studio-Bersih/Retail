# Changelog

## 2026-08-24 — Fractional quantities

1.5 kg of ice is now storable. It was not before: every quantity column was
`INT`, so MySQL silently rounded it to 2.

### Changed

- `pos_stok_mutasi.jumlah`, `pos_stok_mutasi.stok_akhir`,
  `pos_stok_outlet.stok`, `pos_master_konversi.jumlah_asal` and
  `jumlah_tujuan` — `INT` → `DECIMAL(15,3)`. Gram and millilitre precision.
  **Not `FLOAT`**: the drift check `stok = SUM(jumlah)` is exact today, and
  floating point would make it report phantom drift forever.
- `pos_satuan` gains `is_pecahan`. Divisibility is a property of the **unit**,
  not of a product — a kilogram divides, a botol does not, for everyone. With
  one unit per product (decision 4) the unit fully determines the behaviour,
  and 10 rows are maintained instead of 2 285. Divisible: `kg`, `liter`.
- `trg_pecahan_mutasi` refuses a fractional `jumlah` or `stok_akhir` when the
  unit is whole-only. Measured at **83 µs per inserted row** over 20 000 rows —
  nothing on a sale, about +8 s on a 100 000-row import.
- The `produk`, `stok`, `mutasi` and `konversi` views trim trailing zeros, so
  twelve bottles reads `12 botol` rather than `12.000`.

### Fixed

- **`faker.php` would have drifted.** It accumulated running balances in PHP
  floats. With fractional quantities those sums stop matching MySQL's exact
  `DECIMAL` arithmetic, and the drift check would have started failing for no
  real reason. It now carries quantities as integer milli-units internally and
  renders to decimal only on write — the same trick as storing money in cents.

### Added

- `database/07_pecahan_check.php` — 9 assertions including that ten additions
  of `0.1` sum to exactly `1.000`, which is the property the whole design rests
  on. All pass.
- Bulk products sold by weight and volume (ice, loose rice, loose sugar, bulk
  oil, kerosene), so the fractional path is actually exercised: 2 729 of 47 466
  movements are fractional.


## 2026-08-24 — Rename: the feature leads, rekap/detail follows

`pos_rekap_[feature]` / `pos_detail_[feature]` becomes
**`pos_[feature]_rekap` / `pos_[feature]_detail`**, so a feature's two halves
sort next to each other. Under the old order every header sat under `r` and
every line under `d`, and a document's two tables were never visible at once.

### Renamed

- `sy_rekap_payment` → `sy_payment_rekap`
- `sy_detail_payment` → `sy_payment_detail`
- Their constraints and indexes follow the table: `fk_payment_detail_rekap`,
  `ck_payment_detail_subtotal`, and so on.
- The contract-only tables in master-item §5.7 — `pos_masuk_rekap` /
  `pos_masuk_detail` and the four other pairs. None are built yet, so this is
  a documentation change for them.

### Notes

- `pos_stok_mutasi.rekap_tipe` is unaffected: its values are feature names
  (`masuk`, `konversi`, …), not table names.
- `CLAUDE.md` §1 now records why the feature leads, and calls `rekap`/`detail`
  a suffix rather than a prefix.
- Verified by a full rebuild: schema, subscription layer, faker, views, then
  both check suites — POS core assertions and 16 of 16 subscription assertions.


## 2026-08-24 — Subscription and entitlement

Implements `docs/superpowers/specs/2026-08-24-subscription-design.md`.

### Added

- `database/05_subscription.sql` — four tables (`sy_pricing`, `sy_subscription`,
  `sy_payment_rekap`, `sy_payment_detail`), four quota triggers, two reading
  views (`subscription`, `payment`), and the seeded flat price list:
  Rp 50.000/month per outlet, Rp 5.000/month per staff.
- `database/06_subscription_check.php` — 16 assertions, half of which must
  fail. Every one runs inside a transaction and rolls back.
- `database/README.md` — the run order, which the file numbers do not imply.
- `faker.php` now creates each company's subscription and the payment that
  bought it, before any outlet or staff row. This is not cosmetic: the quota
  triggers refuse those inserts otherwise, so the faker run is a real
  end-to-end test of the bootstrapping rule.

### Enforcement

Quota is checked by the application first and by a `BEFORE INSERT` /
`BEFORE UPDATE` trigger behind it, so the rule survives a forgotten check, a
bulk import, direct SQL, and the planned Bun.js rewrite. Deactivation is never
blocked — that is how an over-quota company recovers. Expiry is a single
inclusive date comparison; there is no grace state.

`sy_payment_detail` carries `CHECK (subtotal = jumlah * bulan * harga_per_bulan)`,
so a mis-computed line cannot be stored at all.

### Fixed

- **`03_integrity_check.sql` collided with the sample data.** It created a
  company coded `ACME` and the lookups `JW` / `pcs`, all of which `faker.php`
  now owns — so it failed outright on a populated database. It now uses a
  distinct company code, `INSERT IGNORE`s the shared global lookups, and
  creates the subscription row its outlet and staff inserts require.
- **Two of its outputs had become misleading.** The konversi assertion matched
  faker rows sharing `rekap_id` 777, and the closing line claimed "database is
  empty again" while printing 46,869 faker movements. Both now scope to the
  test company and assert that other data is untouched.

### Changed

- `CLAUDE.md`: §1 scoped to transaction documents and extended to `sy_`
  documents; §3 clarifies `sequence`; new §3a for English SaaS-layer table
  names; new sections for view naming and the subscription invariants.

## 2026-08-24 — Reading views and self-documenting columns

### Added

- `database/04_views.sql` — eight read-only views that resolve every `*_id` to
  the name it points at: `produk`, `produk_harga`, `harga`, `konversi`, `stok`,
  `mutasi`, `pending_terima`, `ringkasan_produk`.
- Twenty `COLUMN COMMENT`s across the schema, readable from
  `information_schema.columns` and inherited by the views.

### Clarified

- **`pos_level_harga.sequence` is not the price level.** The level is the row —
  `nama` holds `Retail` / `GoFood` / `Transfer Pabrik`, and that is what a price
  is keyed by. `sequence` is display order only; nothing resolves prices with
  it. Not renamed: `CLAUDE.md` §3 names `sequence` explicitly as an approved
  English structural term. It is now commented, and surfaces in the `harga`
  view as `urutan_tampil`.

### Notes

- Views take the bare subject name, no prefix — HeidiSQL and
  `information_schema` already separate views from tables. Now written into
  `CLAUDE.md`.
- `harga` (one row per price) and `produk_harga` (one row per product, whole
  price list as text) are easy to confuse; both are documented in the file
  header.
- The database was rebuilt from `01_schema.sql` and the sample data
  regenerated; the faker is seeded, so the data is identical to before.

## 2026-08-24 — Sample data generator

### Added

- `database/faker.php` — generates sample data into `retail` using fakerphp
  (`id_ID` locale, reached through Marmyadose's vendor autoloader). Seeded with
  a fixed `mt_srand`, so a re-run reproduces the same data. Refuses to run
  against a non-empty database without `--force`.
- Loaded at full scale: 2 companies, 60 outlets, 183 employees, 581 products,
  1 769 prices, 13 126 balance rows and 46 869 stock movements over 120
  simulated days — 62 811 rows, ~0.9 MB. Runs in about 6 seconds.
- The second company (CV Kopi Sederhana) has one price level and no regions,
  exercising the "flat price" path the spec calls out in §5.5.
- `infographic.html` gained a sample-data section and now reports live counts.

### Fixed during generation

- **Ledger timestamps did not match the recorded running balance.** Events were
  emitted in simulation order but stamped with random times inside the day, so
  replaying the ledger by `created_at` — the way an auditor would — disagreed
  with `stok_akhir` on 802 rows. Each day's events are now shuffled into one
  schedule and stamped from a clock that only moves forward.
- **`rekap_id` collided between companies.** The counters were per-company, but
  the document tables they will point at have a single auto-increment key, so
  two companies could never share an id. The counters are now global.

### Verified on the generated data

Cached balance equals `SUM(jumlah)` on all 13 126 balance rows; `stok_akhir`
replays correctly in chronological order across all 46 869 movements; no
negative sale lacks an `alasan_minus`; no `penyesuaian` was written below
auditor; no movement crosses tenants; all 1 802 paired documents hold exactly
two rows and every transfer nets to zero.

## 2026-08-24 — Schema v1 implemented on local MySQL

### Added

- `database/01_schema.sql` — the `retail` database and all 14 tables from §5 of
  `docs/superpowers/specs/2026-08-24-master-item-design.md`. Applied to the
  local server (MySQL 8.0.42, `127.0.0.1:3306`). 32 foreign keys, 2 CHECK
  constraints, 82 indexed columns.
- `database/02_seed_demo.sql` — optional demo tenant, catalog, price matrix and
  the §5.6 worked stock example. **Not applied**; the database is left empty so
  real data can load without colliding with fixtures.
- `database/03_integrity_check.sql` — exercises the schema inside a transaction
  and rolls back. Verifies the NULL-barcode / NULL-region asymmetry, the
  three-step price resolution, the ledger-versus-cache drift check, and konversi
  as two rows sharing one `rekap_id`.
- `infographic.html` — visual map of the database: the `dao`/`retail` boundary,
  the table graph with all 32 foreign keys, price resolution, and the stock
  ledger.

### Notes

- Document tables (§5.7 — `pos_*_rekap` / `pos_*_detail`) were **not** created.
  The spec scopes them to the next module, which is why `pos_stok_mutasi`
  carries `rekap_tipe` / `rekap_id` with no foreign key.
- `pos_stok_outlet` gained a `created_at` alongside the `updated_at` the spec
  lists, for consistency with the `created_at` / `updated_at` rule in
  `CLAUDE.md` §3.
- Open question 3 (column language) is treated as settled by `CLAUDE.md` §3:
  `lower_snake_case`, Indonesian domain nouns, English structural terms.
- Open question 4 (authentication across the two databases) remains unresolved
  and is not blocked by this schema.
- The legacy `schema.sql` at the repository root is untouched and unreferenced.
