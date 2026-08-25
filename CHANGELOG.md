# Changelog

Notable changes to the Retail POS frontend. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- **Design system rebuilt around the warm-neutral source palette.** The four
  sampled swatches (`#F9F8F6`, `#EFE9E3`, `#D9CFC7`, `#C9B59C`) are all light
  surfaces, so the ink, the action colour and the dark theme's surfaces are
  derived from the same ~30° hue rather than sampled. `src/routes/layout.css`
  now carries the whole system: a sand ramp, a warm ink ramp, espresso
  surfaces, desaturated semantics, and the two daisyUI themes built on them.
- daisyUI's stock `light` / `dark` replaced by `retail` / `retail-dark`. The
  dark theme is the same palette read from the other end — sand becomes the
  action colour and carries dark text, since mocha disappears against
  espresso.
- Elevation, scrims and the focus ring are tinted with the palette's brown.
  Neutral black over cream reads as dirt; the warm tint reads as shade.
- Drawer and Modal moved onto those tokens, and gained a hairline border so
  they still separate from the canvas at the contrast this palette works at.
- `src/library/config/index.ts` exports a single `useConfig` object instead of
  loose constants.
- The theme store toggles by position in `useConfig.THEMES` and validates what
  it reads from `localStorage`, so a theme name saved by an older build is
  discarded rather than applied as a dead `data-theme`.

### Added

- `data-theme` is stamped on `<html>` in `app.html`, so the first paint is
  already the right theme instead of flashing.
- App-wide focus ring, warm `::selection`, palette scrollbars, and press
  feedback on buttons — all honouring `prefers-reduced-motion`.

### Removed

- `Source.png` and `sample.css` — the palette reference and the styling
  sample from another project. Both are captured in `layout.css` now.

## Earlier

- Reference-counted body scroll lock, so stacked overlays release it correctly.
- Fonts, toasts, portal rendering, icon system and the shared components.
- SvelteKit frontend scaffolded with Tailwind 4 and daisyUI 5.
