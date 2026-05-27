# Update — Design Spec

**Date:** 2026-05-27
**Feature:** `/outlet/updates/` — Internal Update Feed
**Status:** Approved

---

## Overview

Update is a static HTML display page that serves as the first screen users see after logging in. It renders a single HTML string sourced from a mock file — no database calls, no dynamic fetching. The admin sets the content manually on the backend (mock for now); the frontend renders it verbatim with `{@html updateContent}`.

All roles (cashier, manager, admin) see the same content. No filtering, no read/unread tracking, no CRUD.

---

## Routing

```
/outlet/updates/   →   src/routes/outlet/updates/+page.svelte
```

- Accessible to all authenticated roles — no role guard required
- The `/outlet/` layout's default redirect changes to `/outlet/updates/`
- A nav link to Updates is added to the outlet sidebar

---

## Data Model

```typescript
// src/library/mock/updates.ts
export const updateContent: string = `...` // raw HTML string set by admin
```

No interfaces, no arrays, no timestamps. One exported string.

---

## Page

`src/routes/outlet/updates/+page.svelte` imports `updateContent` and renders:

```svelte
<script lang="ts">
    import { updateContent } from "$lib/mock/updates"
</script>

<div class="update-container">
    {@html updateContent}
</div>
```

A minimal wrapper class (`update-container`) provides max-width and padding so the HTML content doesn't stretch wall-to-wall. The content itself is fully controlled by the HTML string — any styling within it is respected as-is.

---

## Seed HTML Content

The mock exports a realistic-looking internal memo that demonstrates the range of content types an admin might post. It includes:

- A **maintenance notice** with a styled warning callout (amber)
- A **new feature announcement** with a brief description and badge
- An **internal memo** section with bullet points
- A **system status** callout (green, all systems operational)
- A **footer** with a sign-off from the admin

The seed content uses inline styles and standard HTML elements only (no external CSS or scripts) so it renders correctly in any DaisyUI theme environment.

---

## Layout Changes

**`src/routes/outlet/+layout.svelte`:**
- Default redirect on `/outlet/` changed from its current target to `/outlet/updates/`
- Nav link "📢 Update" (or similar icon) added to the sidebar, linking to `/outlet/updates/`

---

## Out of Scope

- Multiple posts / feed pagination
- Read / unread tracking per user
- Role-based content filtering
- Edit UI in the frontend
- Timestamps or post metadata
- Admin posting interface
