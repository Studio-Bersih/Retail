# Retail POS — Project Conventions

Multi-company, multi-outlet Point of Sale.
Frontend: SvelteKit. Backend: Marmyadose (Laravel), migrating to Bun.js later.

## Database naming — STRICT

These rules are binding on every future design and brainstorming session.
Do not invent alternatives; if a case is not covered here, ask before deviating.

### 1. Parent/child tables

**Any table that has a child MUST be named `pos_rekap_[feature]`, and its child
MUST be named `pos_detail_[feature]`.**

- `pos_rekap_[feature]` — the document header. One row per transaction.
  Who, where, when, totals, status.
- `pos_detail_[feature]` — the document lines. One row per item on that
  transaction, pointing back at the rekap row.

The `[feature]` segment is identical on both halves. It names the business
document, not the table's role.

| Feature        | Header                | Lines                  |
| -------------- | --------------------- | ---------------------- |
| Retail sale    | `pos_rekap_retail`    | `pos_detail_retail`    |
| Item Masuk     | `pos_rekap_masuk`     | `pos_detail_masuk`     |
| Item Keluar    | `pos_rekap_keluar`    | `pos_detail_keluar`    |
| Konversi       | `pos_rekap_konversi`  | `pos_detail_konversi`  |
| Transfer       | `pos_rekap_transfer`  | `pos_detail_transfer`  |

A table with no child does not take the `rekap`/`detail` prefix.

### 2. Other prefixes

| Prefix        | Meaning                          | Examples                              |
| ------------- | -------------------------------- | ------------------------------------- |
| `sy_`         | System / organisational          | `sy_perusahaan`, `sy_outlet`, `sy_karyawan` |
| `pos_master_` | Master data, company-owned       | `pos_master_produk`, `pos_master_konversi` |
| `pos_`        | Lookups, pricing, stock, ledgers | `pos_satuan`, `pos_harga_produk`, `pos_stok_outlet` |

### 3. Columns

- `lower_snake_case`. Never `UPPERCASE`.
- Indonesian for domain nouns (`kode`, `nama`, `harga`, `satuan`, `jenis`,
  `merek`, `stok`, `jumlah`). English for structural/technical terms
  (`id`, `created_at`, `is_active`, `sequence`).
- **Never use the word `delta`.** A signed quantity change is `jumlah`.
  A resulting balance is `stok_akhir`.
- Surrogate primary key `id BIGINT UNSIGNED AUTO_INCREMENT` on every table.
- Foreign keys are `<thing>_id` and reference `id` — never a natural string
  key. Natural codes (`kode`, `nama`) stay as `UNIQUE` columns only.
- Money is `DECIMAL(15,2)`. Never `INT`.
- Timestamps are `created_at` / `updated_at`.

### 4. Multi-tenancy

- Every company-owned table carries `perusahaan_id`, including where it is
  technically derivable through a parent. It is there for tenant-scoped
  queries and for safety.
- Uniqueness of a company-facing code is always scoped:
  `UNIQUE(perusahaan_id, kode)` — never `UNIQUE(kode)`.
- Tables that are deliberately global carry no `perusahaan_id`:
  `pos_satuan`, `pos_region`.

### 5. Rules learned the hard way

- **`ON UPDATE CASCADE` on a natural key is banned.** The legacy schema joined
  products to lookups by their string value, so renaming a brand rewrote every
  product row. Join on `id`.
- **`UNIQUE` over a nullable column does not constrain `NULL` rows in MySQL.**
  Where `NULL` means "applies to all", add a `STORED` generated column
  (`COALESCE(col, 0)`) and put the unique index on that instead.
- **Enum values must not carry leading or trailing whitespace.** The legacy
  `STATUS` enum contained `' Diskontinu'`, which silently broke comparisons.
- **One enum, one axis.** Do not mix availability and lifecycle in a single
  column the way legacy `STATUS` did.

## Design process

Architectural work goes through brainstorming → spec in
`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` → implementation plan.
Build order: features first, then performance, then UI restructure.
