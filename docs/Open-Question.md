# Open Questions

This file is a living SOP document. After every spec or implementation plan is created, any concern, ambiguity, or unresolved question gets added here. Questions are resolved by answering them inline and marking them closed, or by updating the relevant spec/plan.

Format per entry:
- **Status:** Open / Closed
- **Raised by:** spec or plan filename
- **Question:** the concern
- **Resolution:** (filled in when closed)

---

## Riwayat Transaksi

### Q1 — Scope of transaction sources
**Status:** Closed
**Raised by:** `2026-05-27-pesanan-design.md`
**Question:** Riwayat Transaksi is supposed to log all completed transactions. Which sources feed into it?
**Resolution:** Retail and Pesanan only — strictly sales transactions. Separated into two tabs (not a unified list). Resolved 2026-05-27.

---

### Q2 — Perbaikan Transaksi on Riwayat entries
**Status:** Closed
**Raised by:** `2026-05-03-perbaikan-transaksi.md`, confirmed by user 2026-05-27
**Question:** PT on completed transactions — does it work the same for Retail and Pesanan sources?
**Resolution:** Yes, same PT flow for both. Riwayat uses a discriminated union (`RiwayatSnapshot = RetailSnapshot | PesananTransactionSnapshot`) with a `source` field. Both get full-field PT with admin approval. No PTI in Riwayat for either source. Resolved 2026-05-27 via Riwayat design spec.

---

## Pesanan

### Q3 — Member display in table
**Status:** Closed
**Raised by:** `2026-05-27-pesanan.md` (Task 3)
**Question:** The Pesanan table's Member column shows `snap.memberId` (a raw ID string like `"member-001"`). Should this instead show the member's name by looking up `getMockMembers()`? Raw IDs in a table are not user-friendly.
**Resolution:** Yes — always display the member's name. Use `getMockMembers().find(m => m.id === snap.memberId)?.name ?? '—'`. Apply the same lookup in every table or modal that shows a member reference. Resolved 2026-05-28.

---

### Q4 — Outlet display in admin view
**Status:** Closed
**Raised by:** `2026-05-27-pesanan.md` (Task 3)
**Question:** Admin sees an Outlet column showing `snap.outletId` (e.g., `"outlet-1"`). Should this be the human-readable outlet name? If so, what mock provides outlet names?
**Resolution:** Yes — display outlet name. Look up from the outlets mock (`getOutlets().find(o => o.id === snap.outletId)?.name ?? snap.outletId`). Resolved 2026-05-28.

---

### Q5 — Checkout PaymentModal coupling
**Status:** Closed
**Raised by:** `2026-05-27-pesanan-design.md`
**Question:** The spec says checkout should "open the existing PaymentModal.svelte from Retail." The implementation plan uses an inline checkout modal instead, to avoid coupling Pesanan to Retail's internal component API. If PaymentModal is eventually designed to be a shared component, the inline checkout modal in Pesanan should be replaced. Is PaymentModal intended to be shared, or should each feature own its checkout flow?
**Resolution:** Each feature owns its checkout flow. PaymentModal stays in Retail. Pesanan's inline checkout modal is the correct approach. No shared PaymentModal. Resolved 2026-05-28.

---

### Q6 — Retail Order mode cart field names
**Status:** Closed
**Raised by:** `2026-05-27-pesanan.md` (Task 6)
**Question:** Task 6 maps cart store fields to `PesananSnapshot` using names like `$cart.packaging`, `$cart.orderDate`, `$cart.whatsapp`, `$cart.deliveryType`. These names are guessed — the actual Retail cart store fields depend on the Retail plan's implementation. This mapping must be verified when both plans are executed together. If field names differ, Task 6 will fail to compile.
**Resolution:** Retail plan (2026-05-08-retail.md) uses separate stores — not `$cart`. Correct field paths: `$orderMeta.orderDate`, `$orderMeta.whatsapp`, `$orderMeta.deliveryType` from the `orderMeta` writable store; `$additionalCosts.packaging`, `$additionalCosts.modification`, `$additionalCosts.transport`, `$additionalCosts.other` from the `additionalCosts` store. Pesanan Task 6 must import and use these stores instead of reading from `$cart`. Resolved 2026-05-28.

---

### Q7 — Cancellation route rename
**Status:** Closed
**Raised by:** `2026-05-27-pesanan-design.md` (revised)
**Question:** Original spec had `/outlet/pesanan/repair`. Revised spec changed this to `/outlet/pesanan/cancellation/`. Is this intentional?
**Resolution:** Yes — since PT was removed from Pesanan (active orders are freely editable), the admin page only handles cancellations. `/cancellation/` is a more accurate name.

---

## Pergerakan Stok / Stock Movement

### Q8 — logStockMovement schema contract
**Status:** Closed
**Raised by:** `2026-05-27-pesanan.md` (Task 3, submitCheckout)
**Question:** The Pesanan plan calls `logStockMovement({ id, itemId, outletId, delta, source: 'sale', referenceId, recordedAt, recordedBy })`. This shape is assumed to match `mock/master-items.ts`. If the actual `logStockMovement` signature differs (e.g., different field names, missing fields, extra required fields), the Pesanan checkout will fail at runtime. Verify when `mock/master-items.ts` is implemented.
**Resolution:** The authoritative contract from `2026-05-13-master-item-design.md` is: `logStockMovement({ itemId, outletId, delta, source, sourceId, executedBy, note? })`. The Pesanan plan uses incorrect field names (`referenceId` → `sourceId`, `recordedBy` → `executedBy`). Pesanan Task 3 must use the correct names. The `id` and `recordedAt` fields are generated internally by `logStockMovement`, not supplied by the caller. Resolved 2026-05-28.

---

## Layout & Navigation

### Q9 — Default redirect target
**Status:** Closed
**Raised by:** `2026-05-27-update-design.md`, `2026-05-27-pesanan.md` (Task 5)
**Question:** The Update spec requires `/outlet/` to redirect to `/outlet/updates/`. The Pesanan layout task adds a nav link but must not change the redirect. When implementing the layout, confirm the redirect target is preserved. This needs explicit checking whenever `+layout.svelte` is modified.
**Resolution:** `/outlet/` redirects to `/outlet/updates/`. This is the canonical default. Every `+layout.svelte` edit must preserve this redirect. Resolved 2026-05-28.

---

## Rencana Produksi

### Q10 — Stock movement source type for production
**Status:** Closed
**Raised by:** `2026-05-13-rencana-produksi.md`
**Question:** Production plans consume raw materials and produce finished goods. What `StockMovementSource` values should be used? The current `StockMovementSource` union was defined in `mock/stock-movements.ts`. Confirm that `"production_in"` and `"production_out"` (or equivalent) are in the union before the Rencana Produksi plan is executed.
**Resolution:** The Master Item spec (`2026-05-13-master-item-design.md`) defines the authoritative `StockMovementSource` union. The correct values are `"produksi_consume"` (raw materials consumed) and `"produksi_produce"` (finished goods added to stock). Both are already in the union. No new source types needed. Resolved 2026-05-28.

---

## Riwayat Transaksi

### Q12 — `sale_void` StockMovementSource value
**Status:** Closed
**Raised by:** `2026-05-27-riwayat-transaksi.md` (Task 2, approveRepairRequest)
**Question:** `approveRepairRequest` calls `logStockMovement` with `source: 'sale_void'` when a PT approval reduces item qty (returning stock). Is `'sale_void'` a valid value in the `StockMovementSource` union defined in `mock/stock-movements.ts`? If not, the approval function will fail type-check. Verify when stock-movements mock is implemented.
**Resolution:** `"sale_void"` is already in the `StockMovementSource` union in the Master Item spec (`2026-05-13-master-item-design.md`). No addition needed. Resolved 2026-05-28.

---

## Kasir Harian

### Q13 — computeShiftTotals: Pesanan DP source
**Status:** Closed
**Raised by:** `2026-05-27-kasir-harian-design.md`
**Question:** `computeShiftTotals` reads Pesanan DP cash from `mock/pesanan.ts`. DP payments are stored inside `PesananPayment[]` on each `Pesanan` record. The filter must match `cashierId` AND payment date to the `tanggalSetor`. The `PesananPayment` shape must include a `paidAt` date field and a `cashierId` for this to work. Verify the Pesanan mock's payment shape before implementing `computeShiftTotals`.
**Resolution:** `PesananPayment` has `paidAt: string` but is missing `cashierId`. **Fix:** add `cashierId: string` to the `PesananPayment` interface in `src/library/types/Pesanan.ts` and populate it from `$auth.userId` in `checkoutPesanan()`. This must be done in the Pesanan plan's Task 1 (types) before Kasir Harian is implemented. Resolved 2026-05-28.

### Q14 — computeShiftTotals: Kas cashierId filter
**Status:** Closed
**Raised by:** `2026-05-27-kasir-harian-design.md`
**Question:** `computeShiftTotals` filters Kas Masuk/Keluar by `createdBy === cashierId`. The Akuntansi spec stores `createdBy` on `KasSnapshot`. Confirm this field is accessible on the current mock before the Kasir plan is executed.
**Resolution:** Confirmed — `KasSnapshot.createdBy: string` exists in the Akuntansi spec (`2026-05-07-akuntansi-design.md`), set from `$auth.userId` on creation. The filter will work as designed. Resolved 2026-05-28.

---

## Perbaikan Transaksi Dashboard

### Q16 — Aggregator source mock function name contracts
**Status:** Closed
**Raised by:** `2026-05-27-perbaikan-transaksi-dashboard.md` (Task 2)
**Question:** The PT aggregator mock (`mock/perbaikan-transaksi.ts`) assumes specific function names in each source mock (e.g., `getRepairRequestById`, `getRiwayatById`, `approveRepairRequest` in riwayat.ts; `getKasRepairRequestById`, `getKasById` in kas.ts; `getShiftRepairRequestById`, `getShiftById`, `approveShiftRepairRequest` in kasir.ts — full list in the plan's "Source Mock Contracts" section). If any source mock uses different names, the aggregator will silently return nulls/empty arrays via its try/catch fallback. Verify all names match when source plans are executed.
**Resolution:** Deferred to execution time. The PT Dashboard plan must be executed concurrently with all source plans (Riwayat, Akuntansi, Kasir Harian). Before the PT Dashboard Task 2 is marked complete, all function names in the "Source Mock Contracts" section must be verified against their actual implementations. Resolved 2026-05-28.

---

### Q15 — "Revisi" deep-link target for rejected requests
**Status:** Closed
**Raised by:** `2026-05-27-perbaikan-transaksi-dashboard-design.md`
**Question:** The detail page shows a "Revisi" button when a non-admin user's PT request is rejected. Clicking it should take the user back to the source feature to resubmit. None of the source feature specs define a deep-link that pre-populates the PT edit form with the rejected snapshot. Should the "Revisi" button simply navigate to the source feature's list page (user finds their record and clicks PT again), or should the dashboard pass state (e.g., via query param or a store) to pre-open the PT form? Resolve when the PT dashboard plan is executed.
**Resolution:** "Revisi" navigates to the source feature's list page only. No state is passed. The user finds their record in the source list and re-opens PT from there. Simple navigation, no query param or store coupling. Resolved 2026-05-28.

---

## General

### Q11 — Vitest setup
**Status:** Closed
**Raised by:** `2026-05-27-pesanan.md` (Task 2)
**Question:** The Pesanan plan includes `vitest` tests. Vitest is not listed in CLAUDE.md's install list. If vitest is not installed, `npx vitest run` will fail. Confirm vitest is added to devDependencies during project bootstrap, or add it explicitly to Task 0 of any plan that includes tests.
**Resolution:** `vitest` must be added to devDependencies in Task 0 of the pergerakan-stok plan (the bootstrap task). Add `npm install -D vitest` to the install step. All subsequent plans that include tests depend on this. Resolved 2026-05-28.

---

## Kupon

### OQ-K01 — Supervisor auth PIN model
**Status:** Closed
**Raised by:** `2026-05-27-kupon-design.md`
**Question:** For supervisor auth PIN: is it per-staff (each supervisor has their own PIN) or a shared outlet PIN?
**Resolution:** Per-staff. Each supervisor authenticates with their own NIP (staff ID), validated against mock staff records / `$auth`. No shared outlet PIN. Resolved 2026-05-28.

### OQ-K02 — additionalCost toward minTransaksi
**Status:** Closed
**Raised by:** `2026-05-27-kupon-design.md`
**Question:** Should `additionalCost` (packaging, transport, modification) count toward `minTransaksi`?
**Resolution:** No — only item subtotal counts toward `minTransaksi`. Additional costs are excluded from the threshold calculation. Resolved 2026-05-28.

### OQ-K03 — RemoveItem reversal on coupon removal
**Status:** Closed
**Raised by:** `2026-05-27-kupon-design.md`
**Question:** When a coupon with `RemoveItem` mutation removes an item the cashier manually re-adds after applying the coupon, what happens on coupon removal (reversal)?
**Resolution:** Restore `cartSnapshot` fully on coupon removal, discarding all post-apply manual changes to mutated items. The pre-mutation cart state is authoritative for reversal. Resolved 2026-05-28.

### OQ-K04 — Batch code export
**Status:** Closed
**Raised by:** `2026-05-27-kupon-design.md`
**Question:** Should the Batch code export (download) feature be in scope for the factory dashboard, or deferred?
**Resolution:** Deferred. Not in scope for v1. The factory dashboard shows the code pool in a read-only table; CSV export is a future enhancement. Resolved 2026-05-28.
