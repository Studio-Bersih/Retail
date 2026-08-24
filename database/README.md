# `retail` database

Local MySQL: `127.0.0.1:3306`, user `root`. Everything here writes only to the
`retail` database and never touches Marmyadose's `dao`.

## Run order

The file numbers name the files, not the order. **This is the order:**

```bash
# 1. POS core — 14 tables
mysql -h 127.0.0.1 -P 3306 -u root -proot < database/01_schema.sql

# 2. subscription layer — 4 tables, 4 triggers, 2 views, seeded pricing
mysql -h 127.0.0.1 -P 3306 -u root -proot < database/05_subscription.sql

# 3. sample data — must come after step 2, see below
php database/faker.php --scale=full --force

# 4. reading views for the POS domain
mysql -h 127.0.0.1 -P 3306 -u root -proot < database/04_views.sql
```

**Step 2 must precede step 3.** The quota triggers refuse an insert into
`sy_outlet` or `sy_karyawan` when the company has no `sy_subscription` row, so
the faker creates each company's subscription before its outlets and staff.
Running the faker against a database without the subscription tables exits with
a message rather than a stack trace.

## Checks

Both leave no rows behind — every assertion runs inside a transaction that is
rolled back.

```bash
# POS core: price resolution, the NULL asymmetry, ledger drift, konversi pairs
mysql -h 127.0.0.1 -P 3306 -u root -proot --table < database/03_integrity_check.sql

# subscription: quota gates, reactivation, bootstrapping, renewal, login gate
php database/06_subscription_check.php

# fractional quantities: which units divide, and that DECIMAL sums stay exact
php database/07_pecahan_check.php
```

## Files

| File | What it is |
| ---- | ---------- |
| `01_schema.sql` | POS core. Drops and recreates all 14 tables. |
| `02_seed_demo.sql` | Minimal hand-written fixture — the spec's worked examples. Superseded by `faker.php`; kept for reading. |
| `03_integrity_check.sql` | POS core assertions. Rolls back. |
| `04_views.sql` | Eight reading views for the POS domain. |
| `05_subscription.sql` | Subscription tables, quota triggers, `subscription` and `payment` views, seeded `sy_pricing`. |
| `06_subscription_check.php` | 16 subscription assertions, half of which must fail. Rolls back. |
| `07_pecahan_check.php` | 9 fractional-quantity assertions. Rolls back. |
| `faker.php` | Sample data: 2 companies, 120 days of trade, ~63k rows. Seeded — reruns are identical. |

## Rebuilding from scratch

`01_schema.sql` and `05_subscription.sql` both drop what they own, so re-running
steps 1–4 in order is always safe. `faker.php` refuses to run against a
populated database without `--force`.
