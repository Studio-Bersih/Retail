# Studio Bersih - POS UI Guidelines (Evolved Design)

## Philosophy

* Reduce cognitive load drastically via intelligent keyboard hijacking.
* Minimize visual noise globally (Hide standard HTML spinners inside number inputs using `:global` strict configurations).
* Prioritize clarity via strict alignment definitions using DaisyUI classes.

---

## Component Separation Logic

### 1. Formatted Flow Architecture

* **Input Arrays Left**: All searching, pricing manipulation, member identifications, and metadata selection exist primarily separated on the Left Pane.
* **Review Operations Right**: All cart summaries, final quantity manipulators, order totals seamlessly stay explicitly pinned strictly right avoiding mouse criss-crossing delays.

---

## Custom Global Abstractions

### 1. The `<Rupiah />` Component
* Natively enforces explicit Rupiah prefixes globally.
* Prevents generic string allocations natively enforcing strictly valid numerical translations before propagating to components.
* Allows dynamically mapping `autofocus={true}` triggering specific `node.focus()` timeout checks dynamically perfectly hooking into opened modals natively across the entire software frame.

### 2. Strict Interaction Logic

* **Arrow Key Cart Navigation**: Using up and down inherently jumps explicitly between numeric item quantity inputs inside `<CartSection />`.
* **Shortcut Binding**: `CTRL + Enter` maps directly globally inside components securely binding internal logic bypassing button requirements to submit workflows aggressively quickly.
* **Escaped Focuses**: Specific elements like `ItemsSearchModal.svelte` and global structures force `autofocus` onto primary inputs seamlessly trapping workflow speeds natively.

---

## 8. Typography & Component Displays

* All components map dynamically natively against `Inter` fonts supporting exact Tailwind variable injections automatically tracking responsive UI parameters smoothly across Light & Dark UI selections gracefully via standard SVGs.
* Visual stock metrics dynamically adjust `<span class="bg-error">` classes when human input crosses simulated maximums seamlessly signaling data validation visually natively inline with item details.

### 3. Deep Aesthetic Rendering (Cards & Tables)
* **Accent Palette Hooking:** Move past generic grays natively pulling `bg-accent/10` and `border-primary/10` combos mapped directly from `tailwind.config.js` to define soft headers and background components, yielding a cohesive warm brand styling dynamically responding to themes.
* **Aggressive Rounding:** Utilize `rounded-2xl` and `rounded-3xl` alongside `overflow-hidden` constraints rigorously on primary wrappers simulating crisp standalone card evaluations without clutter.
* **Graceful Status Displays:** When lists render empty natively intercept failures gracefully supplying light transparency SVG illustrations paired cohesively alongside contextual hints rather than blank backgrounds.
---

## 9. Spacing & Indentation (Project Configuration)

* A strict, customized `.prettierrc.config` ruleset governs all internal framework designs.
* `printWidth: 10000` -> Zero new line attribute breakouts! HTML Attributes remain cleanly explicitly written horizontally ensuring maximum visual processing speeds.
* `tabWidth: 4` -> Expanded explicitly rendering block separations vastly cleanly compared to default 2 scale. 

---

## Goal

Make cashier interaction completely invisible:

* Fast ⚡ (Keybinds)
* Clear 🧠 (Smart filtering against unneeded variables)
* Stress-free 😌 (Strict validation feedback natively using daisyUI)