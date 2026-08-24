<script lang="ts">
    /**
     * Renders an SVG from `static/icons/<name>.svg`.
     *
     * It uses `mask-image` rather than `<img>` on purpose. An `<img>` renders the
     * SVG in its own document, so it cannot see the surrounding `color` and would
     * stay black in a dark theme. Masking paints the icon with `currentColor`, so
     * it follows daisyUI themes and utilities like `text-error` for free.
     *
     * The trade-off: an icon is a silhouette. Its own fill and stroke colours are
     * ignored. Multi-colour artwork belongs in `static/images/`.
     */
    type Props = {
        /** filename in static/icons, without the .svg */
        name: string;
        /** px, applied to both width and height */
        size?: number;
        class?: string;
        /** exposed to assistive tech; omit for purely decorative icons */
        label?: string;
    };

    let { name, size = 20, class: className = '', label }: Props = $props();

    const url = $derived(`/icons/${name}.svg`);
</script>

<span
    class="icon {className}"
    style="--icon-url: url('{url}'); --icon-size: {size}px"
    role={label ? 'img' : 'presentation'}
    aria-label={label}
    aria-hidden={label ? undefined : 'true'}
></span>

<style>
    .icon {
        display: inline-block;
        width: var(--icon-size);
        height: var(--icon-size);
        flex: none;
        background-color: currentColor;
        -webkit-mask-image: var(--icon-url);
        mask-image: var(--icon-url);
        -webkit-mask-repeat: no-repeat;
        mask-repeat: no-repeat;
        -webkit-mask-position: center;
        mask-position: center;
        -webkit-mask-size: contain;
        mask-size: contain;
    }
</style>
