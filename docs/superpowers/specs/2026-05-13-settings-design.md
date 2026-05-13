# Settings Feature Design Spec
**Date:** 2026-05-13
**Feature:** `/factory/settings/` — Cabang & Pengguna Management

---

## Overview

The Settings section is the foundational configuration layer for the Studio Bersih POS system. It lives under `/factory/settings/` and provides admin-only CRUD for two entities: **Cabang** (Branches) and **Pengguna** (System Users). Every other feature in the system — stock, transactions, item transfers, productions — references a Branch via `branchId`. Users are assigned to a Branch at creation time, determining their operational scope.

Future reference data (e-money providers, satuan, region, supplier, sales staff) will live in a sibling section: `/factory/data-master/`.

---

## Routing

```
/factory/settings/                → redirects to /factory/settings/branches
/factory/settings/branches/       → Cabang list page
/factory/settings/users/          → Pengguna list page
```

Access: **Admin role only.** Cashier and Manager cannot access `/factory/settings/`.

---

## Shared Layout

`/factory/settings/+layout.svelte` renders a left sidebar with two navigation items:

| Icon | Label | Route |
|------|-------|-------|
| 🏪 | Cabang | `/factory/settings/branches` |
| 👤 | Pengguna | `/factory/settings/users` |

Active item is highlighted. The sidebar is fixed-width (160px), content fills the remainder.

---

## Page 1 — Cabang

**Route:** `/factory/settings/branches/+page.svelte`

### Data Model

```typescript
interface Branch {
    id: string           // unique identifier, auto-generated
    name: string         // display name, e.g. "Jakarta Pusat"
    region: string       // free-text region label, e.g. "Jakarta"
    address: string
    phone: string
    isActive: boolean
}
```

`region` is free-text for now. When the Data Master feature is built, it becomes a foreign key to a Region entity; the field name and type stay identical.

### List View

Standard dashboard table per CLAUDE.md conventions:
- **Toolbar:** search input (filters `name`, `region`) on the left + per-page select (`10/25/50/100`) on the right + `+ Tambah Cabang` button
- **Columns:** Nama Cabang | Wilayah | Telepon | Status | Aksi
- **Status badge:** `Aktif` (green) / `Nonaktif` (amber)
- **Aksi:** single `Edit` button per row — opens the modal in edit mode
- **Pagination:** sliding 5-button window per CLAUDE.md canonical block

### Add/Edit Modal

Triggered by `+ Tambah Cabang` (add mode) or `Edit` row action (edit mode). Single `BranchModal` component.

Fields:
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Nama Cabang | text | yes | |
| Wilayah | text | yes | free-text for now |
| Telepon | text | no | |
| Alamat | text | no | |
| Cabang aktif | checkbox | — | defaults to `true` on add |

On save: `POST /api/branches` (add) or `PATCH /api/branches/:id` (edit).

### Deactivation Behaviour

Deactivating a branch (`isActive: false`) **does not delete any data.** Existing `OutletStock`, `StockMovement`, and transaction records that reference this `branchId` are preserved. An inactive branch is hidden from:
- The branch dropdown in the Users modal
- Any branch picker across other features

It remains visible in the Cabang list (filterable by status).

---

## Page 2 — Pengguna

**Route:** `/factory/settings/users/+page.svelte`

### Data Model

```typescript
interface SystemUser {
    id: string
    name: string
    username: string        // unique system-wide
    password: string        // stored hashed; never returned in API responses
    role: "cashier" | "manager" | "admin"
    branchId: string | null // null when role is "admin"
    isActive: boolean
}
```

Role semantics (unchanged from existing auth spec):
- `cashier` — outlet-level: POS, history for own branch
- `manager` — outlet-level + stock operations (item masuk, keluar, transfer, adjustment, konversi)
- `admin` — all factory pages including Settings; `branchId` is always `null`

### List View

Standard dashboard table:
- **Toolbar:** search input (filters `name`, `username`, branch name) + per-page select + `+ Tambah Pengguna` button
- **Columns:** Nama | Username | Role | Cabang | Status | Aksi
- **Role badge colours:** Admin = purple (`#a78bfa`), Manajer = green (`#86efac`), Kasir = teal (`#6ee7b7`)
- **Cabang cell:** shows branch name, or italic "Semua" for admin users
- **Status badge:** `Aktif` / `Nonaktif`
- **Aksi:** single `Edit` button per row

### Add/Edit Modal

Single `UserModal` component.

Fields:
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Nama Lengkap | text | yes | |
| Username | text | yes | validated unique on submit |
| Password | password | add: yes / edit: no | edit mode hides field behind "Ganti Password" toggle |
| Role | select | yes | `Kasir / Manajer / Admin` |
| Cabang | select | yes | populated from active branches; auto-locked to "Semua Cabang" when role = Admin |
| Akun aktif | checkbox | — | defaults to `true` on add |

**Role → Cabang interaction:** when the user selects `Admin` in the Role dropdown, the Cabang select is replaced with a disabled display reading "Semua Cabang" and `branchId` is sent as `null`. Switching away from Admin re-enables the select.

**Edit mode password:** field is hidden by default. A `Ganti Password` link/button reveals it. If left hidden on save, the password is not included in the PATCH payload.

On save: `POST /api/users` (add) or `PATCH /api/users/:id` (edit).

---

## Auth Store Impact

The existing `auth` store in `src/library/stores/auth.ts` gains one field rename:

```typescript
// Before
outletId: string

// After
branchId: string
```

`outletId` is replaced by `branchId` everywhere it is read or written — auth store, transaction payloads, stock movement logs, and mock data. The values and meaning are identical; only the key name changes.

---

## Component File Map

```
src/routes/factory/settings/
  +layout.svelte                  — sidebar nav (Cabang | Pengguna)
  branches/
    +page.svelte                  — table + BranchModal inline
  users/
    +page.svelte                  — table + UserModal inline
```

Both modals are defined inline in their respective `+page.svelte` files — they are not shared and do not warrant extraction to `src/library/components/`.

---

## Mock Data

`src/library/mock/branches.ts` — array of `Branch` objects (3–5 sample branches across Jakarta, Jabar, Jatim regions).

`src/library/mock/users.ts` — array of `SystemUser` objects covering all three roles; one admin (branchId: null), one manager, two cashiers across different branches.

---

## Access Control Summary

| Role | Can access `/factory/settings/` | Can add/edit Cabang | Can add/edit Pengguna |
|------|--------------------------------|--------------------|-----------------------|
| Admin | ✓ | ✓ | ✓ |
| Manager | ✗ | ✗ | ✗ |
| Cashier | ✗ | ✗ | ✗ |
