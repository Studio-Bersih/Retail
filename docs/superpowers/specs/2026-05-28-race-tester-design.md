# Race Condition Tester — Design Spec

**Date:** 2026-05-28
**Feature:** Race Condition & Throughput Benchmark Script
**Status:** Approved

---

## Goal

A single Bun script that stress-tests the Studio Bersih backend for race conditions in stock depletion, coupon redemption, and kasir shift creation — and also benchmarks raw throughput (RPS + latency percentiles) to find the machine's saturation point.

## Architecture

**File:** `server/scripts/race-test.ts`

Run with:
```bash
bun run server/scripts/race-test.ts [flags]
```

No additional dependencies. Uses native `bun fetch` and direct Drizzle DB access (imported from `server/src/db/index.ts`) for seeding and post-run verification.

### Startup

1. Load `.env` via Bun's built-in dotenv.
2. Validate `DATABASE_URL` and server URL (default `http://localhost:3000`).
3. Authenticate all 4 mock users (`admin`, `manager`, `kasir1`, `kasir2`) against `POST /api/auth/login`. Store their JWT tokens in a token pool. Abort if any login fails.
4. Run phases sequentially (or the single phase selected by `--phase`).

### Idempotency key rule

The server's idempotency hook deduplicates `POST /transactions` and `POST /orders` by `X-Idempotency-Key`. Every concurrent request in this script generates a fresh `crypto.randomUUID()` as its key — this ensures all requests reach the database layer and the race-condition logic is actually exercised.

---

## Phases

### Phase 1 — Stock Depletion Race

**What it proves:** PostgreSQL row-level locking inside `db.transaction()` prevents stock from going negative when N cashiers simultaneously buy the last unit.

**Setup (direct DB write):**
- Find any active item in `outletStock` for outlet `O001`.
- Set `stock = 1` directly via Drizzle — bypasses the API so the seed is atomic and known.

**Execution:**
- Fire `N` (default: `10`) concurrent `POST /api/transactions`, each buying 1 unit of that item.
- Each request uses a unique bearer token (round-robin from token pool) and a unique `X-Idempotency-Key`.
- Collect all responses with `Promise.allSettled`.

**Verification:**
- Count HTTP `201` responses — expected: exactly `1`.
- Count non-`201` responses — expected: `N - 1`.
- Query `outletStock.stock` directly from DB — expected: `0`. Negative = race detected.

**Verdict:**
- `PASS ✅` — exactly 1 success, stock = 0.
- `FAIL ❌` — more than 1 success or stock < 0.

---

### Phase 2 — Coupon Double-Redemption Race

**What it proves:** `kuotaTotal = 1` enforcement is atomic — a kupon cannot be redeemed more than its quota even under concurrent load.

**Setup (direct DB write):**
- Insert a test kupon row into `coupons`: `kode = "RACETEST"`, `kuotaTotal = 1`, `status = "active"`, `kategori = "Standard"`.
- Clear any existing `kuponLog` rows for `kodeKupon = "RACETEST"`.

**Execution:**
- Fire `N` (default: `10`) concurrent `POST /api/transactions`, each including the kupon code `"RACETEST"`.
- Same round-robin tokens and unique idempotency keys as Phase 1.

**Verification:**
- Count `201` responses — expected: exactly `1`.
- Query `kuponLog` for `kodeKupon = "RACETEST"` — expected: exactly `1` row with `logType = "Applied"`. More rows = race detected.

**Verdict:**
- `PASS ✅` — 1 success, 1 kuponLog row.
- `FAIL ❌` — multiple successes or multiple log rows.

**Cleanup:** Delete the `"RACETEST"` kupon and its log rows.

---

### Phase 3 — Kasir Shift Collision

**What it proves:** Concurrent requests to open a kasir shift for the same outlet + date produce exactly one record.

**Setup (direct DB write):**
- Delete any existing `kasirHarian` row for outlet `O001` + today's date.

**Execution:**
- Fire `N` (default: `5`) concurrent `POST /api/kasir/open` with body `{ outletId: "O001", date: <today> }`.
- Each uses a unique bearer token and standard headers.

**Verification:**
- Count `201` responses — expected: exactly `1`.
- Query `kasirHarian` for outlet `O001` + today — expected: exactly `1` row.

**Verdict:**
- `PASS ✅` — 1 success, 1 DB row.
- `FAIL ❌` — multiple rows = duplicate shift created.

---

### Phase 4 — Throughput Benchmark

**What it measures:** Peak RPS and latency distribution under increasing concurrency. Identifies the saturation point of the server on this machine.

**Target endpoint:** `POST /api/transactions` (the heaviest write path — hits DB transaction, stock check, audit log).

**Ramp levels:** `10 → 50 → 100 → 200 → 500` concurrent workers.

**Per level:**
- Each worker fires requests back-to-back for `5 seconds`.
- Collect per-request latency (ms) with `performance.now()`.
- Compute: total requests, RPS, p50, p95, p99 latency, error rate (non-`2xx` / total).
- Stop the ramp early if error rate > 5% or p99 > 5000ms.

**Output table (per level):**
```
Concurrency    RPS     p50     p95     p99    Errors
────────────────────────────────────────────────────
10            142    64ms   112ms   198ms    0.0%
50            398    89ms   245ms   412ms    0.0%
100           521   178ms   456ms   780ms    0.2%
200           489   398ms   890ms  1.82s     8.4%  ← saturation
```

**Summary line:** `Peak RPS: 521 at concurrency 100. Recommended max: 100 workers.`

---

## CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--url <url>` | `http://localhost:3000` | Target server |
| `--phase stock\|coupon\|shift\|bench` | (all) | Run only one phase |
| `--concurrency <n>` | `10` | Concurrent workers for race phases 1–3 |
| `--duration <s>` | `5` | Seconds per benchmark ramp level |
| `--json` | off | Emit JSON report to stdout instead of ASCII |

---

## Output Format

Each phase prints:
1. Phase header with parameters (item name, kupon code, concurrency count).
2. Live counter: `Firing N requests...` with millisecond timestamps on each response.
3. Result table: successes, failures, DB verification result.
4. Verdict line: `PASS ✅`, `FAIL ❌`, or `RACE DETECTED 🔥`.

Final summary after all phases:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Studio Bersih — Race Test Summary
  Stock:   PASS ✅
  Coupon:  PASS ✅
  Shift:   PASS ✅
  Bench:   Peak 521 RPS @ concurrency 100
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Important Notes

- **Phases 1–3 require the relevant backend endpoints to exist.** If an endpoint returns `404`, the phase is skipped with a `SKIPPED (endpoint not yet built)` notice rather than failing.
- **Phase 4 (benchmark) requires `POST /api/transactions` to be live.** It is skipped the same way if not found.
- The script does not mock anything — it tests the live server end-to-end.
- Direct DB access (for seeding and verification) uses `server/src/db/index.ts` — the same Drizzle client the server uses. This means the script must be run from within the `server/` project context.
