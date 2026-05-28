# Studio Bersih - POS General Coding Style Guide

This document serves as the general coding convention standard for the Studio Bersih - POS project, combining the patterns established within core structural directories like `src/library/utils` and `src/library/hooks`.

## 1. Modular and Pure Functional Design
- **Isolated Logic:** Write utilities and helpers as small, pure functions that take isolated arguments and return processed outputs without causing UI side-effects. 
- **Standardized Exports:** Append an explicit `export { funcA, funcB, funcC }` at the bottom of the script, or concisely prefix definitions with `export function` inline.

## 2. Strong Typing & Exhaustive Literals (TypeScript)
- **Clear Abstractions:** Always define explicit `interface` or `type` contracts for parameter configurations and API responses (e.g., `export interface ResponseType { data: any; status: string; message: string; }`).
- **Literal Unions over Enums:** Favor providing exhaustive, strict literal union typings (e.g., `type: "date" | "date-short" | "timestamp"`) over generic `string` assertions or bloated TypeScript `enum` variables. This enhances IDE autocomplete rendering and refactoring safety.

## 3. Defensive Programming & Safety Fallbacks
- **Proactive Input Sanitation:** Sanitize parameter inputs relentlessly. Determine safe, generic fallback values when processing potentially `null`, `undefined`, or empty string arguments.
  - Strings should fallback to a dash `"-"` or remain blank `""`.
  - Empty or invalid number parsers should safely resolve to `0`.
- **Regex Scrubbing:** Utilize robust JavaScript Regular Expressions (`Regex`) for deep scrubbing character streams (e.g., removing non-string characters or stripping formatted currencies back down into parsable numeric digits).

## 4. Centralized Error Handling & Immediate UI Validation
- **No Empty Failures:** Catch network transactions and processing errors robustly. For functional mutative actions (like API `POST` events), return user-friendly error response shapes rather than throwing unwrapped errors so UI state components don't crash outright.
- **Localized Static Mapping:** Never hardcode error or warning alert strings directly. Source all messages exclusively from standard, unified validator mappings (e.g., `useNotice.connection.*`).
- **Global Flash Messaging:** Broadcast immediate visual confirmation or errors to the UI right from within the interaction layers using the global `toast` (`svelte-sonner`) system, detaching the responsibility purely from UI layouts.

## 5. Environment Hook Configuration & Global State Interfacing
- **Single Responsibility Hooks:** Custom hooks should encapsulate a solitary transaction context (like `useDB` managing all dynamic centralized API routing abstractions internally).
- **Synchronous Store Consumption:** When extracting global reactive configuration states (like auth tokens or runtime toggles) inside static non-Svelte scripts, dynamically retrieve their values immediately using Svelte's structural `get(storeName)` mechanism (e.g., `get(useConfiguration)`).
- **Validator Singletons (`useDefault`):** Centralize filtering logic like establishing generic boundary definitions (First Day of month, current timelines) directly into `/validator` components preventing sprawling duplicated component logics identically parsing Date formats globally.

## 7. Dashboard Pagination Pattern

Every page that renders a list or table must include a **search bar**, a **per-page dropdown**, and **client-side pagination**. All three are mandatory and must be implemented inline in the page file (not extracted into a sub-component unless the component is reused across multiple pages).

### Rules

- **Search** filters across all meaningful string/number fields of every row using a single `<input type="text">`. It is case-insensitive and matches substrings.
- **Per-page** options are fixed: `10`, `25`, `50`, `100`. Default is `25`.
- **Pagination** is derived from the filtered result set (not the full list). Renders at most **5 page buttons** as a sliding window centered on `currentPage`. Changing `search` or `perPage` resets `currentPage` to `1`.

### Reactive State (copy verbatim, adjust `items` and filter predicate)

```typescript
let search = ""
let perPage: 10 | 25 | 50 | 100 = 25
let currentPage = 1

$: filtered = items.filter(item =>
  Object.values(item).some(v => String(v).toLowerCase().includes(search.toLowerCase()))
)
$: totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
$: paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)
$: if (search !== undefined || perPage) currentPage = 1

$: pageButtons = (() => {
  let start = Math.max(1, currentPage - 2)
  let end = Math.min(totalPages, start + 4)
  if (end - start < 4) start = Math.max(1, end - 4)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
})()
```

Render `{#each paginated as item}` in the table body — never `items` or `filtered` directly.

### Toolbar Markup (search left, per-page right)

```svelte
<div class="flex items-center justify-between gap-4 mb-4">
  <input
    type="text"
    class="input input-bordered input-sm w-72"
    placeholder="Cari..."
    bind:value={search}
  />
  <select class="select select-bordered select-sm" bind:value={perPage}>
    <option value={10}>10 / halaman</option>
    <option value={25}>25 / halaman</option>
    <option value={50}>50 / halaman</option>
    <option value={100}>100 / halaman</option>
  </select>
</div>
```

### Pagination Markup (below the table)

```svelte
{#if totalPages > 1}
  <div class="flex justify-center items-center gap-1 mt-4">
    <button class="btn btn-sm btn-ghost" disabled={currentPage === 1} on:click={() => currentPage--}>‹</button>
    {#each pageButtons as p}
      <button
        class="btn btn-sm {p === currentPage ? 'btn-primary' : 'btn-ghost'}"
        on:click={() => currentPage = p}
      >{p}</button>
    {/each}
    <button class="btn btn-sm btn-ghost" disabled={currentPage === totalPages} on:click={() => currentPage++}>›</button>
  </div>
{/if}
```

### Page Window Logic

`pageButtons` is a sliding window of at most 5 integers. Examples:

| totalPages | currentPage | pageButtons |
|---|---|---|
| 10 | 1 | [1, 2, 3, 4, 5] |
| 10 | 4 | [2, 3, 4, 5, 6] |
| 10 | 10 | [6, 7, 8, 9, 10] |
| 3 | 2 | [1, 2, 3] |

### Filter Predicate Customisation

When `Object.values()` would include internal IDs or fields that should not be searchable (e.g., raw UUIDs, boolean flags), filter the keys explicitly:

```typescript
const SEARCHABLE: Array<keyof MyType> = ["name", "kategori", "keterangan", "tanggal"]

$: filtered = items.filter(item =>
  SEARCHABLE.some(k => String(item[k]).toLowerCase().includes(search.toLowerCase()))
)
```

---

## 6. Control Flow Style

- **No one-liner `if` bodies.** Every `if` (and `else`) block must use curly braces with the body on its own line, even for single-statement returns or throws. This applies to both TypeScript and Svelte files.

```typescript
// ❌ Never
if (!foundUser) return null
if (role === 'cashier') return status(403, { message: Errors.FORBIDDEN })

// ✅ Always
if (!foundUser) {
    return null
}
if (role === 'cashier') {
    return status(403, { message: Errors.FORBIDDEN })
}
```

## 7. Embracing Powerful Native APIs vs Third-Party Packages
- **Prioritize Native Efficiency:** Aim to build on standard resilient ECMAScript and robust native Browser APIs over resorting straight to heavy external formatting node_modules.
- **Intrinsic Localization Capabilities:** 
  - Leverage `Intl.DateTimeFormatOptions` and natively injected parameters for `toLocaleDateString` for precise Indonesian (`id-ID`) date adjustments instead of installing libraries like MomentJS.
  - Exploit native instances of `new Intl.NumberFormat` specialized with standard currency traits (`"IDR"`) to rapidly process mass transaction currency iterations with unmatched speed.
