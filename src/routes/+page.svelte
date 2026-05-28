<script lang="ts">
    import { onMount } from 'svelte'
    import { goto } from '$app/navigation'
    import { get } from 'svelte/store'
    import { auth, setAuth } from '$library/stores/auth'
    import { login } from '$library/mock/auth'
    import { toast } from '$library/stores/toast'

    let username    = $state('')
    let password    = $state('')
    let loading     = $state(false)
    let passwordEl  = $state<HTMLInputElement | null>(null)

    onMount(() => {
        if (get(auth)) goto('/outlet')
    })

    function submit() {
        if (!username.trim() || !password.trim()) return
        loading = true
        try {
            const session = login(username.trim(), password)
            setAuth(session)
            goto('/outlet')
        } catch (caughtError: unknown) {
            loading = false
            const msg = caughtError instanceof Error ? caughtError.message : 'Login gagal'
            toast.error(msg === 'useNotice.connection.unauthorized' ? 'Username atau password salah.' : msg)
            password = ''
            passwordEl?.focus()
        }
    }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Enter') submit() }} />

<div class="min-h-screen flex items-center justify-center bg-[var(--bg)]">
    <div class="bg-base-100 border border-[var(--border)] rounded-[14px] shadow-xl w-full max-w-sm p-8">
        <div class="text-center mb-8">
            <h1 class="text-[22px] font-bold tracking-tight text-[var(--text)]">
                Studio <span class="text-[var(--primary)]">Bersih</span>
            </h1>
            <p class="text-[13px] text-[var(--text-muted)] mt-1">Point of Sale</p>
        </div>

        <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-1.5">
                <label for="username" class="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-muted)]">Username</label>
                <input id="username" type="text" class="input input-bordered input-sm w-full" placeholder="Username" bind:value={username} autocomplete="username" />
            </div>
            <div class="flex flex-col gap-1.5">
                <label for="password" class="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-muted)]">Password</label>
                <input id="password" type="password" class="input input-bordered input-sm w-full" placeholder="••••••••" bind:value={password} bind:this={passwordEl} autocomplete="current-password" />
            </div>

            <button class="btn btn-primary btn-sm w-full mt-2" onclick={submit} disabled={loading}>
                {#if loading}
                    <span class="loading loading-spinner loading-xs"></span>
                {:else}
                    Masuk
                {/if}
            </button>
        </div>
    </div>
</div>
