# Images

Raster and multi-colour artwork: photographs, logos, illustrations, empty-state
graphics, receipt marks.

Single-colour interface icons do **not** belong here — they go in
`static/icons/` and are rendered through `$components/shared/Icon.svelte`.

Reference anything here from the site root:

```svelte
<img src="/images/logo.png" alt="Retail POS" />
```

Files in `static/` are served as-is and are **not** processed, hashed or
optimised by Vite. Anything that should be optimised or content-hashed belongs
in `src/library/assets/` and should be imported instead.
