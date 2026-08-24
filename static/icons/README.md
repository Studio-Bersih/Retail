# Icons

Every icon in this project is an **SVG file in this folder**. No icon packages,
no inline `<svg>` in components, no icon fonts.

## Using one

```svelte
<script lang="ts">
  import Icon from '$components/shared/Icon.svelte';
</script>

<Icon name="close" />
<Icon name="store" size={32} class="text-primary" />
```

`Icon.svelte` renders the file with `mask-image` and paints it with
`background-color: currentColor`. That matters: an SVG loaded through `<img>`
renders in isolation and **cannot inherit the surrounding text colour**, so it
would stay black in a dark theme. Masking makes the icon take whatever colour
its parent has, which is what you want with daisyUI themes.

The consequence is that an icon is a **silhouette** — it is painted in one
colour and its own `fill` / `stroke` values are ignored. Multi-colour artwork
belongs in `static/images/`, not here.

## Adding one

Drop a `.svg` file in this folder, then use it by filename without the
extension. Keep to the house style so they sit together:

- `viewBox="0 0 24 24"`, no `width` or `height` attribute
- `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`
- `stroke-linecap="round"`, `stroke-linejoin="round"`
- one line, no XML prolog, no comments

`favicon.svg` is the exception — it is referenced directly by `<link rel="icon">`
in the root layout and is not used through `Icon.svelte`.
