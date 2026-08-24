# Changelog

## 2026-08-24 — Reading views and self-documenting columns

### Added

- `database/04_views.sql` — eight read-only views that resolve every `*_id` to
  the name it points at: `v_produk`, `v_produk_harga`, `v_harga_produk`,
  `v_konversi`, `v_stok_outlet`, `v_stok_mutasi`, `v_pending_terima`,
  `v_ringkasan_produk`. Run after `01_schema.sql`.
- Twenty `COLUMN COMMENT`s across the schema, readable from
  `information_schema.columns` and inherited by the views.

### Clarified

- **`pos_level_harga.sequence` is not the price level.** The level is the row —
  `nama` holds `Retail` / `GoFood` / `Transfer Pabrik`, and that is what a price
  is keyed by. `sequence` is display order only; nothing resolves prices with
  it. Not renamed: `CLAUDE.md` §3 names `sequence` explicitly as an approved
  English structural term. It is now commented, and surfaces in
  `v_harga_produk` as `urutan_tampil`.

### Notes

- View naming (`v_` prefix) is not covered by `CLAUDE.md` and needs blessing
  before it spreads.
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

- Document tables (§5.7 — `pos_rekap_*` / `pos_detail_*`) were **not** created.
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
