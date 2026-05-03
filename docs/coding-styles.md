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

## 6. Embracing Powerful Native APIs vs Third-Party Packages
- **Prioritize Native Efficiency:** Aim to build on standard resilient ECMAScript and robust native Browser APIs over resorting straight to heavy external formatting node_modules.
- **Intrinsic Localization Capabilities:** 
  - Leverage `Intl.DateTimeFormatOptions` and natively injected parameters for `toLocaleDateString` for precise Indonesian (`id-ID`) date adjustments instead of installing libraries like MomentJS.
  - Exploit native instances of `new Intl.NumberFormat` specialized with standard currency traits (`"IDR"`) to rapidly process mass transaction currency iterations with unmatched speed.
