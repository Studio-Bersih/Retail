# Subscription & Entitlement — Design

**Date:** 2026-08-24
**Status:** Awaiting review
**Scope:** Yearly subscription, seat quotas for outlets and staff, and the
enforcement that makes them real.
**Not in scope:** Payment gateways, automatic renewal, invoicing as a product,
dunning email, the vendor admin UI, and fractional stock quantities (its own
design).

## 1. Purpose

The POS is sold as SaaS. A company pays yearly, and what they pay for is
**outlets and staff**. The system has to answer two questions at all times:
has this company paid, and are they within what they paid for.

Everything here sits above the existing schema. `sy_perusahaan` is already the
tenant, and `sy_outlet` and `sy_karyawan` are already the billable units —
both already carry `is_active`. What is missing is the entitlement layer.

## 2. Decisions taken

Each was settled during brainstorming and holds unless this document is revised.

| # | Decision |
| - | -------- |
| 1 | **One company term, seats counted.** A single `berlaku_sampai` per company. Outlets and staff are quantities within it, not individually expiring things. |
| 2 | **A seat is a currently-active row.** Deactivating frees it immediately. Retail turnover costs the customer nothing. |
| 3 | **Hard lock at expiry.** Login is refused the day the term ends. There is no grace state. |
| 4 | **Entitlement only in v1.** No gateway, no automatic renewal. Payment is taken out of band and recorded. |
| 5 | **Flat pricing.** One price per unit type, the same for every company. No negotiated deals. |
| 6 | **Application enforces, the database backstops.** Laravel gives the good error; a trigger refuses anything that gets past it. |
| 7 | **Under-renewal is allowed.** A company over its quota keeps working but cannot add or reactivate until it is back under. |
| 8 | **The system never deactivates or deletes a customer's rows.** Only the company does that. |
| 9 | **Subscription data lives in `retail`.** Forced by decision 6 — see §4. |
| 10 | **SaaS-layer table names are English; the POS domain stays Indonesian.** See §3. |

### Why not per-item expiry

The original request was an expiry date on each outlet and each staff member.
At current sample scale that is 60 outlets plus 183 staff — up to 243 renewal
dates for one customer, each with its own invoice and its own chasing, and no
sensible answer to "what happens when one cashier lapses". One company term
collapses that to one date and one invoice, at the cost of pro-rata arithmetic
when seats are added mid-term.

### Why hard lock, with the risk stated

Hard lock is one date comparison and cannot be misunderstood. The cost is real
and accepted: a bank transfer clearing a day late shuts the shop, and a lapse
on a Saturday costs a trading day. The escape hatch is not a grace *state* —
it is that a human can move `berlaku_sampai` and write why in `catatan`. That
keeps the enforcement a single comparison while leaving room for judgement.

## 3. Naming

Governed by `CLAUDE.md`, with two carve-outs this design introduces. Both need
to be written into `CLAUDE.md` before they spread.

**Carve-out 1 — English for the SaaS layer.** `CLAUDE.md` §3 requires
Indonesian domain nouns. The vendor-facing subscription layer uses English
*table* names (`sy_subscription`, `sy_pricing`, `sy_payment_rekap`) because
these are vendor concepts, not shop-floor ones. **Columns keep §3 unchanged** —
`berlaku_sampai`, `kuota_outlet`, `harga_per_bulan`, `tanggal`, `jumlah`.

**Carve-out 2 — `rekap`/`detail` outside `pos_`.** §1 mandates
`pos_[feature]_rekap` / `pos_[feature]_detail` for any table with a child. A
payment genuinely is a document — the header is one renewal, the lines are
"5 outlets × Rp 50.000 × 12 months" — so the convention fits, with the `sy_`
prefix because this is organisational rather than POS data.

No existing table needs renaming under §1. Its own wording scopes the rule to
transaction documents ("one row per transaction", "one row per item on that
transaction"), and §2 already assigns `pos_master_` and `pos_` to master data
and lookups. The only transaction documents in the system are the §5.7 tables
of the master-item design, which already follow the convention.

## 4. Where this lives

In `retail`, with the `sy_` prefix. This is **determined by decision 6**, not
chosen freely: a `BEFORE INSERT` trigger on `sy_karyawan` has to read the quota,
and reading it from another database would be a cross-database dependency —
exactly what `CLAUDE.md` forbids, and exactly the coupling that was refused
against `dao`.

If central billing across several products is ever needed, the migration is to
keep these tables as a synced cache and move the truth to a control plane. The
columns do not change, so that stays cheap.

## 5. Schema

### 5.1 Pricing

```sql
sy_pricing                          -- global. The landing page reads this.
  id              BIGINT UNSIGNED PK
  jenis           ENUM('outlet','karyawan')  UNIQUE
  nama            VARCHAR(50)       -- "Outlet / cabang", "Staff"
  keterangan?     VARCHAR(255)      -- the blurb shown under it
  harga_per_bulan DECIMAL(15,2)     -- 50000.00 / 5000.00
  sequence        SMALLINT          -- display order, same meaning as pos_level_harga
  is_active       BOOLEAN DEFAULT 1
  created_at, updated_at
```

No `perusahaan_id`: pricing is flat, so this is a global table alongside
`pos_satuan` and `pos_region`. `UNIQUE(jenis)` does the whole job — one price
per thing, no resolution ladder and no nullable-unique trap.

The public landing page and the renewal calculation read the same row, so the
advertised price and the billed price cannot disagree.

### 5.2 Current entitlement

```sql
sy_subscription                     -- one row per company. The triggers read this.
  id              BIGINT UNSIGNED PK
  perusahaan_id   -> sy_perusahaan  UNIQUE
  berlaku_sampai  DATE NOT NULL     -- the hard-lock date
  kuota_outlet    INT NOT NULL
  kuota_karyawan  INT NOT NULL
  catatan?        VARCHAR(255)      -- "transfer in flight, extended 3 days"
  diubah_oleh     VARCHAR(100)      -- vendor staff name; see open question 1
  created_at, updated_at
```

**No status column.** Expired is `berlaku_sampai < CURDATE()`. Over quota is
`kuota_x < COUNT(active)`. Both are derived, so neither can drift out of step
with the thing it describes — the same reasoning that made `WHERE stok < 0` the
pending-receipt list instead of a table.

Suspending a company for any reason is done by setting `berlaku_sampai` to a
past date. No separate mechanism.

### 5.3 Payments

```sql
sy_payment_rekap                    -- one row per renewal
  id              BIGINT UNSIGNED PK
  perusahaan_id   -> sy_perusahaan
  nomor           VARCHAR(30)
  tanggal         DATE
  periode_mulai   DATE
  periode_sampai  DATE
  total           DECIMAL(15,2)
  status          ENUM('draft','lunas','batal')
  metode?         VARCHAR(50)       -- "transfer BCA"
  catatan?        VARCHAR(255)
  dicatat_oleh    VARCHAR(100)
  created_at, updated_at
  UNIQUE(perusahaan_id, nomor)
  INDEX(perusahaan_id, tanggal)

sy_payment_detail                   -- the lines
  id              BIGINT UNSIGNED PK
  perusahaan_id   -> sy_perusahaan  -- carried per CLAUDE.md §4, though derivable
  rekap_id        -> sy_payment_rekap
  jenis           ENUM('outlet','karyawan','lainnya')
  keterangan      VARCHAR(150)      -- "Outlet tambahan"
  jumlah          INT               -- 5 SEATS, not a stock quantity. Always whole.
  bulan           INT               -- 12
  harga_per_bulan DECIMAL(15,2)     -- 50000.00 — snapshot, not a lookup
  subtotal        DECIMAL(15,2)
  INDEX(rekap_id)
```

**`harga_per_bulan` is copied onto the line, never joined from `sy_pricing`.**
Raising prices next year must not rewrite what a customer was charged this
year. This is the same principle as §7 of the master-item design: the sale line
snapshots the price charged.

**`sy_payment_rekap` is the truth; `sy_subscription` is a cache of it** — the
same relationship `pos_stok_mutasi` has with `pos_stok_outlet`. Marking a
payment `lunas` extends the term and sets the quota **in the same transaction**.

## 6. Enforcement

Two gates, checking different things.

### 6.1 Login gate

```sql
SELECT berlaku_sampai < CURDATE() AS terkunci
FROM sy_subscription WHERE perusahaan_id = ?
```

The term is **inclusive**: a company with `berlaku_sampai = 2027-08-31` can
trade normally throughout 31 August and is locked on 1 September.

True → authentication refused for every user of that company, including its own
admin. No rows are modified. All data survives untouched and is exactly as it
was when the company renews.

**Consequence to accept deliberately:** because the lock covers the company
admin too, a lapsed customer has no way to see what they owe or to renew from
inside the application. Renewal is entirely out of band — they contact you.
That follows from decision 3 and is the price of a single comparison; if it
becomes a support burden, the smallest fix is to let an expired session reach a
renewal-info screen and nothing else, which is a narrow exception rather than a
grace state.

### 6.2 Quota gate

```
Laravel   "Kuota karyawan habis. 10 seat, 10 terpakai."   friendly, links to renewal
   |  if bypassed
MySQL     ERROR 1644: Kuota karyawan habis                blunt, but nothing gets through
```

The application check exists to produce a usable message and to power a
"2 seats left" indicator. The trigger exists so the rule survives a forgotten
check in one controller, a bulk import, someone using HeidiSQL, and the planned
Bun.js rewrite — which takes this database over whole and would otherwise have
to reimplement the rule correctly from scratch.

### 6.3 The triggers

Four: `BEFORE INSERT` and `BEFORE UPDATE` on each of `sy_outlet` and
`sy_karyawan`. Shape, verified working against MySQL 8.0.42:

```sql
CREATE TRIGGER trg_kuota_karyawan_insert BEFORE INSERT ON sy_karyawan
FOR EACH ROW
BEGIN
  DECLARE terpakai INT;
  DECLARE kuota INT;
  IF NEW.is_active = 1 THEN
    SELECT COUNT(*) INTO terpakai FROM sy_karyawan
      WHERE perusahaan_id = NEW.perusahaan_id AND is_active = 1;
    SELECT kuota_karyawan INTO kuota FROM sy_subscription
      WHERE perusahaan_id = NEW.perusahaan_id;
    IF kuota IS NULL OR terpakai >= kuota THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Kuota karyawan habis - tambah seat dulu';
    END IF;
  END IF;
END
```

The `UPDATE` trigger fires only on a genuine reactivation
(`OLD.is_active = 0 AND NEW.is_active = 1`). **Deactivation is never blocked** —
that is what lets an over-quota company dig itself out.

The `COUNT` rides the existing `UNIQUE(perusahaan_id, nip)` and
`UNIQUE(perusahaan_id, kode)` index prefixes, so no new index is needed. Hiring
and opening outlets are rare events; this is nowhere near a hot path.

### 6.4 Over quota

A company that renews for fewer seats than it currently has active is allowed
to. Everyone keeps working and keeps logging in. What is blocked is **adding**:

```
20 active staff, renewed for 10 seats

  existing 20      keep working
  INSERT           refused
  reactivate       refused
  deactivate       always allowed
  drops to 9       hiring works again
```

Nothing is deactivated on the company's behalf. Auto-deactivating "the newest
10" would pick arbitrary victims and mean a cashier turns up on Monday unable
to log in, with nobody having chosen that.

### 6.5 Bootstrapping

**Creating a company must create its `sy_subscription` row in the same
transaction** — trial term and starter quota. Without that guarantee, the
triggers meet companies with no subscription row and must choose between
failing open, which is a hole in production, and failing closed, which makes it
impossible to create the first outlet. With the row always present, `kuota IS
NULL` means something has gone wrong and failing closed is correct.

## 7. Worked example

Standard pricing: outlet Rp 50.000/month, staff Rp 5.000/month.

```
sy_payment_rekap   INV-2026-014   2026-08-24   status=lunas
                   periode 2026-09-01 .. 2027-08-31      total 4.200.000

sy_payment_detail  outlet     Outlet / cabang    5 x 12 x 50.000 = 3.000.000
                   karyawan   Staff             20 x 12 x  5.000 = 1.200.000

on lunas, in one transaction:
sy_subscription    berlaku_sampai  = 2027-08-31
                   kuota_outlet    = 5
                   kuota_karyawan  = 20
```

## 8. What this changes elsewhere

- **Company creation** grows a second write — the `sy_subscription` row (§6.5).
- **`database/faker.php`** will fail once the triggers exist: it inserts 60
  outlets and 183 staff. It must create subscriptions with matching quota
  first, which is what a real customer of that size would have anyway.
- **The landing page** gains a public read of `sy_pricing`.
- **`CLAUDE.md`** needs the two §3 carve-outs from §3 above written in.
- **A reading view** (`subscription`) should join company, term, quota and
  current usage, in the style of `database/04_views.sql`.

## 9. Deferred

Additive; none require reworking the above.

- Payment gateway, self-serve renewal, automatic term extension
- Invoices as a customer-facing document, receipts, tax fields
- Dunning: reminder emails before expiry
- Per-company negotiated pricing — would reintroduce the `perusahaan_id` plus
  `COALESCE` sentinel pattern that `pos_harga_produk` uses
- Usage-based add-ons beyond outlets and staff
- Monthly as well as yearly terms
- A vendor admin UI; v1 is direct database access

## 10. Open questions

1. **Who is `diubah_oleh` / `dicatat_oleh`?** They are `VARCHAR`, not foreign
   keys, because the person is vendor staff and there is no vendor-user table.
   `sy_karyawan` is the tenant's staff and would be wrong. This is open
   question 4 of the master-item design surfacing again, and it should be
   settled once for both.

2. **Trial terms.** Length and starter quota are business decisions, not
   design ones. §6.5 requires *some* value; the numbers are yours to set.

3. **Pro-rata for mid-term seat additions.** The design supports it —
   `sy_payment_detail.bulan` can be 5 as easily as 12 — but the rounding rule
   (part months up, down, or by day) is unstated.

4. **Renewal reminders.** With hard lock, no dunning, and the company admin
   locked out alongside everyone else (§6.1), a customer's first signal that
   they have lapsed is nobody being able to log in — and their only route back
   is to contact you directly. Some warning before the date, even a banner in
   the last fortnight, would cost little and prevent most of those calls.
   Whether to build it is a product decision, not a schema one.
