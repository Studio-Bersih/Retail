# Kupon — Design Spec

**Date:** 2026-05-27
**Project:** Studio Bersih - POS
**Status:** Approved
**Merges:** Coupon Engine v1.0 + Coupon Engine Adaptations v1.0

---

## Overview

A unified coupon engine that replaces all existing discount mechanisms (`percentDiscount`, `fixedDiscount`) with a single rules-based system. Coupons support fully flexible effects — monetary discounts, free items, and direct cart mutations — in any combination. One coupon per transaction.

The engine is integrated into Retail, Pesanan, and Perbaikan Transaksi. A factory-level admin dashboard allows creating and configuring coupons.

**Dropped from source docs (not applicable to Studio Bersih):**
- `PLATFORM` field — Studio Bersih is POS-only, no mobile app
- `MIN_TIER_ID` — no member tier system in this project

**Kept from Coupon Adaptations:**
- `codeType` — Standard / Batch / PersonalAuto code generation

---

## Routes

| Path | File | Access |
|------|------|--------|
| `/factory/kupon/` | `src/routes/factory/kupon/+page.svelte` | Admin only |
| Retail page | `src/routes/outlet/retail/+page.svelte` (modified) | All roles |
| Pesanan page | `src/routes/outlet/pesanan/+page.svelte` (modified) | All roles |
| PT detail page | `src/routes/outlet/perbaikan-transaksi/[id]/[source]/+page.svelte` (modified) | All roles |

---

## Data Model

### `Kupon`

```typescript
interface Kupon {
    kode: string                                         // unique, user-defined
    nama: string
    kategori: "Public" | "Member-only" | "Personal" | "Staff/Internal"
    kodeMember: string | null                            // Personal coupons only
    outlet: string[] | null                              // null = all outlets
    status: "Active" | "Inactive"
    tanggalMulai: string                                 // ISO date
    tanggalBerakhir: string | null                       // null = no expiry
    minTransaksi: number                                 // 0 = no minimum
    kuotaTotal: number                                   // 0 = unlimited
    kuotaPerMember: number                               // 0 = unlimited
    butuhOtorisasi: boolean
    syaratKetentuan: string | null
    codeType: "Standard" | "Batch" | "PersonalAuto"
    effects: KuponEffects
    createdAt: string
    updatedAt: string | null
}
```

### `KuponEffects`

All three effect categories are optional and can combine freely in a single coupon.

```typescript
interface KuponEffects {
    fixedDiscount: number             // Rp amount off total; 0 = not used
    percentageDiscount: number        // % off total; 0 = not used
    cartMutations: KuponCartMutation[]
}

interface KuponCartMutation {
    type: "AddItem" | "RemoveItem" | "ModifyQty"
    itemId: string                    // references MasterItem.id
    qty: number
    // AddItem:    add qty units of itemId to cart
    // RemoveItem: remove qty units (removes all if qty >= current cart qty)
    // ModifyQty:  delta — positive adds units, negative reduces
    isFree: boolean                   // AddItem only — marks item with isFree: true
    priceOverride: number             // AddItem only — 0 = use MasterItem.priceLevel1
}
```

### `KuponCodePool`

Used for `Batch` and `PersonalAuto` code types only. Standard coupons never appear here.

```typescript
interface KuponCodePool {
    id: string
    kuponKode: string                 // FK → Kupon.kode
    code: string                      // unique entry code, format: {PREFIX6}-{RANDOM8}
    kodeMember: string | null         // PersonalAuto: bound member; null for Batch
    usedAt: string | null             // null = not yet used
    transactionId: string | null      // set when redeemed
}
```

### `KuponLog`

Append-only audit log. Written at transaction completion.

```typescript
interface KuponLog {
    id: string
    kodeKupon: string
    idTransaksi: string | null        // null for AuthFailed entries
    kodeMember: string | null
    nipKasir: string
    nipOtorisasi: string | null       // supervisor who authorized, if applicable
    nilaiPotongan: number             // monetary discount value only
    cartMutations: KuponCartMutation[] // mutations that were applied
    totalSebelum: number
    totalSesudah: number
    outlet: string
    logType: "Applied" | "AuthFailed"
    timestamp: string
}
```

### `KuponSearchResult`

```typescript
interface KuponSearchResult {
    kupon: Kupon
    eligibility: EligibilityResult
}
```

### `AppliedKupon` (runtime state, not persisted)

```typescript
interface AppliedKupon {
    kode: string
    nama: string
    effects: KuponEffects
    butuhOtorisasi: boolean
    authNip: string | null
    snapshot: Kupon                   // cached full record for local re-validation
    cachedUsage: {                    // usage counts fetched at apply time; used by revalidate
        totalUses: number
        memberUses: number
    }
    cartSnapshot: CartItem[]          // pre-mutation cart state; used for reversal on remove
}
```

---

## Eligibility Engine

### Architecture

`src/library/utils/couponEligibility.ts` — pure TypeScript module. No side effects, no API calls, no store access. Called from two places:

1. **`useCoupon.ts` hook** — after mock API search/validate returns a `Kupon` record
2. **Cart-change `$effect`** in the POS page — local re-validation using `appliedKupon.snapshot`, no network round-trip

### EvaluationContext

```typescript
interface EvaluationContext {
    cartTotal: number                 // sum of all item prices (before coupon)
    memberKode: string | null
    outletId: string
    timestamp: Date
    usageHistory: {
        totalUses: number             // pre-fetched from mockKuponLog
        memberUses: number
    }
}
```

### Evaluator Chain (9 evaluators, run in order, short-circuit on first failure)

| Order | Evaluator | Fails when | Returns |
|-------|-----------|-----------|---------|
| 1 | `StatusEvaluator` | `status !== 'Active'` | `INACTIVE` |
| 2 | `DateRangeEvaluator` | before `tanggalMulai` or after `tanggalBerakhir` | `NOT_STARTED` / `EXPIRED` |
| 3 | `TotalQuotaEvaluator` | `usageHistory.totalUses >= kuotaTotal` (skip if 0) | `QUOTA_EXHAUSTED` |
| 4 | `OutletEvaluator` | outlet not in whitelist (skip if null) | `OUTLET_RESTRICTED` |
| 5 | `MemberCategoryEvaluator` | Member-only / Personal and no member selected | `MEMBER_REQUIRED` |
| 6 | `PersonalCouponEvaluator` | Personal coupon and `memberKode !== kodeMember` | `MEMBER_MISMATCH` |
| 7 | `PerMemberQuotaEvaluator` | `usageHistory.memberUses >= kuotaPerMember` (skip if 0) | `PER_MEMBER_QUOTA_EXHAUSTED` |
| 8 | `MinTransaksiEvaluator` | `cartTotal < minTransaksi` (skip if 0) | `MIN_TRANSAKSI_NOT_MET` + delta |
| 9 | `AuthorizationEvaluator` | `butuhOtorisasi` and no `authNip` in context | `AUTHORIZATION_REQUIRED` |

### EligibilityReason + EligibilityResult

```typescript
type EligibilityReason =
    | "INACTIVE" | "NOT_STARTED" | "EXPIRED"
    | "QUOTA_EXHAUSTED" | "OUTLET_RESTRICTED"
    | "MEMBER_REQUIRED" | "MEMBER_MISMATCH"
    | "PER_MEMBER_QUOTA_EXHAUSTED"
    | "MIN_TRANSAKSI_NOT_MET"
    | "AUTHORIZATION_REQUIRED"

interface EligibilityResult {
    eligible: boolean
    reason?: EligibilityReason
    delta?: number                    // only when MIN_TRANSAKSI_NOT_MET
}
```

### Suggestion Engine

After search, any coupon whose only failing condition is `MIN_TRANSAKSI_NOT_MET` with `delta <= 50000` (Rp 50.000 threshold) surfaces as a suggestion with an "unlockable" visual state in `CouponPanel`.

### User-Facing Reason Messages (`reasonToMessage`)

| Reason | Message (Bahasa Indonesia) |
|--------|---------------------------|
| `INACTIVE` | Kupon tidak aktif |
| `NOT_STARTED` | Kupon belum berlaku hingga {tanggalMulai} |
| `EXPIRED` | Kupon kedaluwarsa pada {tanggalBerakhir} |
| `QUOTA_EXHAUSTED` | Kuota penggunaan kupon telah habis |
| `OUTLET_RESTRICTED` | Kupon tidak berlaku di outlet ini |
| `MEMBER_REQUIRED` | Kupon ini memerlukan member yang dipilih |
| `MEMBER_MISMATCH` | Kupon ini adalah kupon personal dan tidak cocok dengan member yang dipilih |
| `PER_MEMBER_QUOTA_EXHAUSTED` | Member ini telah menggunakan kupon ini sebelumnya |
| `MIN_TRANSAKSI_NOT_MET` | Minimum transaksi Rp {minTransaksi} belum terpenuhi (kurang Rp {delta}) |
| `AUTHORIZATION_REQUIRED` | Kupon ini memerlukan otorisasi supervisor |

---

## Code Resolution

All code lookups run this resolution chain before eligibility evaluation:

```
entered code
    │
    ▼
1. Find in mockKuponCodePool WHERE code = entered
    ├── Found (Batch)        → reject if usedAt set ("kode sudah digunakan")
    ├── Found (PersonalAuto) → reject if kodeMember ≠ ctx.memberKode
    └── Found → resolve parent Kupon, continue to eligibility
    │
    └── Not found → look up directly in mockKupon WHERE kode = entered
                    (Standard coupons — no pool row)
```

**PersonalAuto generation:** On first search by a member, if no pool row exists for `(kuponKode, kodeMember)`, generate one in the mock with format `{PREFIX6}-{RANDOM8}` and return it. Idempotent on repeat calls.

---

## `useCoupon.ts` Hook Interface

```typescript
interface UseCoupon {
    search:     (query: string, filterEligible: boolean) => Promise<KuponSearchResult[]>
    getDetail:  (kode: string) => Promise<Kupon>
    validate:   (kode: string, ctx: EvaluationContext) => Promise<EligibilityResult>
    apply:      (kupon: Kupon, authNip: string | null) => void
    remove:     () => void
    revalidate: (ctx: EvaluationContext) => void   // called on every cart mutation
}
```

`apply` mutates the cart by running `effects.cartMutations`, stores `cartSnapshot` before doing so, sets `appliedKupon`, and writes `kuponDiscount` to state.

`remove` restores `cartSnapshot`, clears `appliedKupon` and `kuponDiscount`.

`revalidate` is called from a `$effect` in the POS page whenever `cartItems`, `currentMember`, or `additionalCost` changes. Uses the cached `appliedKupon.snapshot` — no API call. If the result is ineligible, calls `remove()` and shows a toast.

---

## POS Integration (Retail & Pesanan)

### New state in `+page.svelte`

```typescript
let appliedKupon: AppliedKupon | null = $state(null)

let kuponDiscount = $derived(
    appliedKupon === null ? 0
    : appliedKupon.effects.fixedDiscount
      + Math.floor(subtotal * (appliedKupon.effects.percentageDiscount / 100))
)
```

### Updated total formula

```
total = subtotal - kuponDiscount + additionalCost.packaging + additionalCost.transport + additionalCost.modification
```

Free items from `cartMutations` are in the cart at `price = 0`, so they appear in subtotal at zero cost naturally.

### Cart-change re-validation effect

```typescript
$effect(() => {
    if (appliedKupon === null) return
    const ctx: EvaluationContext = {
        cartTotal:    subtotal,
        memberKode:   currentMember?.kode ?? null,
        outletId:     $auth.outletId,
        timestamp:    new Date(),
        usageHistory: appliedKupon.cachedUsage
    }
    const result = evaluate(appliedKupon.snapshot, ctx)
    if (!result.eligible) {
        useCoupon.remove()
        toast.warning(`Kupon ${appliedKupon.kode} tidak lagi berlaku: ${reasonToMessage(result)}`)
    }
})
```

### Updated transaction payload

```typescript
// pricing shape — replaces percentDiscount and fixedDiscount
pricing: {
    subtotal: number,
    kupon: {
        kode: string,
        nilaiPotongan: number,
        cartMutations: KuponCartMutation[],
        authNip: string | null
    } | null,
    additionalCost: { packaging: number, transport: number, modification: number },
    total: number
}
```

---

## CouponPanel Component (`CouponPanel.svelte`)

Embedded in the left pane of Retail and Pesanan, between the member selector and pricing totals.

### States

| State | What shows |
|-------|-----------|
| **Idle** | Search field, "Belum ada kupon" placeholder |
| **Search results** | List of results with eligibility state per row |
| **Unlockable row** | Amber button showing delta (e.g. "+Rp30.000 lagi") |
| **Unavailable row** | Gray, disabled, inline reason tag |
| **Applied** | Applied coupon card with Ganti and Hapus buttons + pricing summary |
| **Auth PIN** | Inline PIN entry inside `CouponDetailDrawer` for `butuhOtorisasi` coupons |

### CouponDetailDrawer (`CouponDetailDrawer.svelte`)

Full detail view. Contains the supervisor auth PIN entry when `butuhOtorisasi = true`. PIN is validated through `useCoupon.validate` with `authNip` context; on success, `useCoupon.apply` is called with the returned NIP.

---

## Perbaikan Transaksi Integration

### Regular PT (`source = "riwayat"`)

The coupon section on the PT detail page is **fully editable**:

- If the original transaction had a coupon: shows the applied coupon card with **Ganti** and **Hapus** buttons
- If no coupon: shows the search field directly (same as POS idle state)
- Ganti replaces the current coupon; Hapus removes it
- Total summary reflects the updated coupon state
- Coupon change is included in the PT diff and submitted with the repair request

### PT Instant (PTI)

The coupon section is **read-only**:

- Shows "🔒 Terkunci — PTI tidak mengubah kupon" badge
- Displays the original coupon as a locked card (or "Tidak ada kupon" if none)
- The diff summary notes "tidak diubah" for the coupon field
- No search field, no Ganti/Hapus buttons

---

## Factory Dashboard (`/factory/kupon/`)

Single-file page. Follows standard Dashboard Conventions (search, per-page, pagination).

### List table columns

| Column | Content |
|--------|---------|
| Kode | Monospaced; links to edit modal |
| Nama | Display name |
| Efek | Effect badges: `-Rp25rb` (green) · `10%` (indigo) · `+2 item` (amber) |
| Kategori | Public / Member-only / Personal / Staff/Internal |
| Berlaku | Date range or "Tidak ada batas" |
| Kuota | `{used}/{total}` or `∞` |
| Status | Active (green) / Inactive (amber) pill |
| Aksi | Edit · Nonaktif/Aktifkan |

### Create/edit modal sections

1. **Informasi Dasar** — kode, nama, kategori, tanggal mulai/berakhir
2. **Syarat Kelayakan** — minTransaksi, outlet whitelist, kuotaTotal, kuotaPerMember, butuhOtorisasi toggle
3. **Efek Kupon** — two subsections:
   - *Diskon Harga*: fixedDiscount (Rp) and percentageDiscount (%) inputs; 0 = not used
   - *Mutasi Keranjang*: row-based builder — select type (Tambah/Hapus/Ubah Qty), Master Item search, qty, isFree toggle; `+ Tambah Mutasi` button
4. **Tipe Kode** — Standard / Batch / PersonalAuto dropdown; Batch shows a "generate pool" UI (count input + generate button) after the coupon is saved
5. **Syarat & Ketentuan** — optional textarea

Soft-delete only: records are toggled Active/Inactive, never hard-deleted, to preserve `KuponLog` integrity.

---

## Mock Data (`src/library/mock/kupon.ts`)

Provides representative coverage of all coupon types and effects:

| Kode | Kategori | Efek | codeType | Notes |
|------|----------|------|----------|-------|
| `HBD2026` | Member-only | -Rp25.000 | Standard | minTransaksi Rp200.000, kuota 500, kuotaPerMember 1 |
| `BUNDLE01` | Public | 10% + gratis Teh Botol ×1 | Standard | minTransaksi Rp50.000 |
| `STAFFONLY` | Staff/Internal | 25% | Standard | butuhOtorisasi true |
| `PERSONAL-RINA` | Personal | -Rp50.000 | Standard | kodeMember = "MBR-RINA" |
| `SUMMER-BATCH` | Public | -Rp50.000 | Batch | pool of 10 mock codes |
| `WELCOME` | Member-only | gratis item ×1 + Rp10.000 off | Standard | new member gift |
| `EXPIRED-TEST` | Public | -Rp10.000 | Standard | tanggalBerakhir in the past |

`mockKuponLog` pre-populated with ~15 entries to exercise quota counters.

---

## Files

### New files

| File | Purpose |
|------|---------|
| `src/library/types/Kupon.ts` | All types: Kupon, KuponEffects, KuponCartMutation, KuponCodePool, KuponLog, AppliedKupon, EligibilityReason, EligibilityResult, EvaluationContext |
| `src/library/mock/kupon.ts` | mockKupon, mockKuponCodePool, mockKuponLog arrays; mock search, validate, apply, generatePersonalAuto handlers |
| `src/library/utils/couponEligibility.ts` | Pure evaluator chain (9 evaluators) + SuggestionEngine + reasonToMessage |
| `src/library/hooks/useCoupon.ts` | I/O hook: search, getDetail, validate, apply, remove, revalidate |
| `src/library/components/coupon/CouponPanel.svelte` | Search, results list, applied card |
| `src/library/components/coupon/CouponDetailDrawer.svelte` | Full coupon detail view |
| `src/routes/factory/kupon/+page.svelte` | Admin dashboard (list + create/edit modal inline) |

### Modified files

| File | Change |
|------|--------|
| `src/library/types/Cart.ts` | Update transaction payload: replace `percentDiscount` + `fixedDiscount` with `kupon` field |
| `src/routes/outlet/retail/+page.svelte` | Add `appliedKupon` state, `kuponDiscount` derived, `CouponPanel`, updated total formula, updated checkout payload, re-validation `$effect` |
| `src/routes/outlet/pesanan/+page.svelte` | Same as Retail |
| `src/routes/outlet/perbaikan-transaksi/[id]/[source]/+page.svelte` | Coupon section: full edit for regular PT, read-only for PTI |
| `CLAUDE.md` | Updated transaction payload shape in Architecture section |

---

## Open Questions

- **OQ-K01** — For supervisor auth PIN: is it per-staff (each supervisor has their own PIN) or a shared outlet PIN? Default design assumes per-staff PIN validated against `$auth`/mock staff records.
- **OQ-K02** — Should `additionalCost` (packaging, transport, modification) count toward `minTransaksi`? Default: no — only item subtotal counts.
- **OQ-K03** — When a coupon with `RemoveItem` mutation removes an item the cashier manually re-adds after applying the coupon, what happens on coupon removal (reversal)? Default: restore `cartSnapshot` fully, discarding post-apply manual changes to mutated items only.
- **OQ-K04** — Should the Batch code export (download) feature be in scope for the factory dashboard, or deferred?
