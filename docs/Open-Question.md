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
**Status:** Open
**Raised by:** `2026-05-27-pesanan.md` (Task 3)
**Question:** The Pesanan table's Member column shows `snap.memberId` (a raw ID string like `"member-001"`). Should this instead show the member's name by looking up `getMockMembers()`? Raw IDs in a table are not user-friendly.

---

### Q4 — Outlet display in admin view
**Status:** Open
**Raised by:** `2026-05-27-pesanan.md` (Task 3)
**Question:** Admin sees an Outlet column showing `snap.outletId` (e.g., `"outlet-1"`). Should this be the human-readable outlet name? If so, what mock provides outlet names?

---

### Q5 — Checkout PaymentModal coupling
**Status:** Open
**Raised by:** `2026-05-27-pesanan-design.md`
**Question:** The spec says checkout should "open the existing PaymentModal.svelte from Retail." The implementation plan uses an inline checkout modal instead, to avoid coupling Pesanan to Retail's internal component API. If PaymentModal is eventually designed to be a shared component, the inline checkout modal in Pesanan should be replaced. Is PaymentModal intended to be shared, or should each feature own its checkout flow?

---

### Q6 — Retail Order mode cart field names
**Status:** Open
**Raised by:** `2026-05-27-pesanan.md` (Task 6)
**Question:** Task 6 maps cart store fields to `PesananSnapshot` using names like `$cart.packaging`, `$cart.orderDate`, `$cart.whatsapp`, `$cart.deliveryType`. These names are guessed — the actual Retail cart store fields depend on the Retail plan's implementation. This mapping must be verified when both plans are executed together. If field names differ, Task 6 will fail to compile.

---

### Q7 — Cancellation route rename
**Status:** Closed
**Raised by:** `2026-05-27-pesanan-design.md` (revised)
**Question:** Original spec had `/outlet/pesanan/repair`. Revised spec changed this to `/outlet/pesanan/cancellation/`. Is this intentional?
**Resolution:** Yes — since PT was removed from Pesanan (active orders are freely editable), the admin page only handles cancellations. `/cancellation/` is a more accurate name.

---

## Pergerakan Stok / Stock Movement

### Q8 — logStockMovement schema contract
**Status:** Open
**Raised by:** `2026-05-27-pesanan.md` (Task 3, submitCheckout)
**Question:** The Pesanan plan calls `logStockMovement({ id, itemId, outletId, delta, source: 'sale', referenceId, recordedAt, recordedBy })`. This shape is assumed to match `mock/master-items.ts`. If the actual `logStockMovement` signature differs (e.g., different field names, missing fields, extra required fields), the Pesanan checkout will fail at runtime. Verify when `mock/master-items.ts` is implemented.

---

## Layout & Navigation

### Q9 — Default redirect target
**Status:** Open
**Raised by:** `2026-05-27-update-design.md`, `2026-05-27-pesanan.md` (Task 5)
**Question:** The Update spec requires `/outlet/` to redirect to `/outlet/updates/`. The Pesanan layout task adds a nav link but must not change the redirect. When implementing the layout, confirm the redirect target is preserved. This needs explicit checking whenever `+layout.svelte` is modified.

---

## Rencana Produksi

### Q10 — Stock movement source type for production
**Status:** Open
**Raised by:** `2026-05-13-rencana-produksi.md`
**Question:** Production plans consume raw materials and produce finished goods. What `StockMovementSource` values should be used? The current `StockMovementSource` union was defined in `mock/stock-movements.ts`. Confirm that `"production_in"` and `"production_out"` (or equivalent) are in the union before the Rencana Produksi plan is executed.

---

## General

### Q11 — Vitest setup
**Status:** Open
**Raised by:** `2026-05-27-pesanan.md` (Task 2)
**Question:** The Pesanan plan includes `vitest` tests. Vitest is not listed in CLAUDE.md's install list. If vitest is not installed, `npx vitest run` will fail. Confirm vitest is added to devDependencies during project bootstrap, or add it explicitly to Task 0 of any plan that includes tests.
