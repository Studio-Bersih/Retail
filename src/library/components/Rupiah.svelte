<script lang="ts">
    import { rupiahFormatter, currencySanitizer } from '$library/utils/formatter'

    interface Props {
        value?: number
        class?: string
        placeholder?: string
        readonly?: boolean
        disabled?: boolean
    }

    let {
        value = $bindable(0),
        class: className = '',
        placeholder = '0',
        readonly = false,
        disabled = false,
    }: Props = $props()

    let raw = $state(rupiahFormatter.format(value))
    let focused = $state(false)

    $effect(() => {
        if (!focused) {
            raw = rupiahFormatter.format(value)
        }
    })

    function onFocus() {
        focused = true
        raw = value === 0 ? '' : String(value)
    }

    function onInput(e: Event) {
        const v = (e.target as HTMLInputElement).value
        raw = v
        value = currencySanitizer(v)
    }

    function onBlur() {
        value = currencySanitizer(raw)
        focused = false
        raw = rupiahFormatter.format(value)
    }
</script>

<input
    class={className}
    value={raw}
    {placeholder}
    {readonly}
    {disabled}
    inputmode="numeric"
    type="text"
    onfocus={onFocus}
    oninput={onInput}
    onblur={onBlur}
/>
