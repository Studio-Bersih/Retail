<script lang="ts">
    import { onMount } from 'svelte'
    import { goto } from '$app/navigation'
    import { page } from '$app/state'
    import { get } from 'svelte/store'
    import { auth } from '$library/stores/auth'
    import { mode } from '$library/stores/mode'
    import { forceWipe } from '$library/utils/cleaner'

    const { children } = $props()

    // ── Auth guard ────────────────────────────────────────────────────────────
    onMount(() => {
        if (!get(auth)) goto('/')
    })

    // ── Tab system ────────────────────────────────────────────────────────────
    interface Tab { id: string; label: string; route: string; icon: string }

    const FEATURES = [
        { id: 'retail',      label: 'Retail',       route: '/outlet/retail',        icon: 'shopping-bag',     desc: 'Transaksi langsung & kasir' },
        { id: 'pesanan',     label: 'Pesanan',       route: '/outlet/pesanan',       icon: 'clipboard',        desc: 'Antrean pesanan aktif' },
        { id: 'riwayat',     label: 'Riwayat',       route: '/outlet/history/retail', icon: 'clock',           desc: 'Semua transaksi selesai' },
        { id: 'kasir',       label: 'Kasir Harian',  route: '/outlet/kasir',         icon: 'bar-chart-2',      desc: 'Laporan shift & setoran' },
        { id: 'stok',        label: 'Master Item',   route: '/outlet/master-item',   icon: 'package',          desc: 'Katalog & stok barang' },
        { id: 'penyesuaian', label: 'Penyesuaian',   route: '/outlet/penyesuaian',   icon: 'sliders-horizontal', desc: 'Penyesuaian stok' }
    ]

    let tabs      = $state<Tab[]>([])
    let activeTab = $state<string | null>(null)

    function openTab(id: string) {
        const existing = tabs.find(t => t.id === id)
        if (existing) { activeTab = id; goto(existing.route); return }
        const def = FEATURES.find(f => f.id === id)
        if (!def) return
        tabs.push({ id: def.id, label: def.label, route: def.route, icon: def.icon })
        activeTab = id
        goto(def.route)
    }

    function closeTab(id: string) {
        const idx = tabs.findIndex(t => t.id === id)
        if (idx === -1) return
        tabs.splice(idx, 1)
        if (activeTab === id) {
            if (tabs.length === 0) { activeTab = null; goto('/outlet') }
            else { const next = tabs[Math.max(0, idx - 1)]; activeTab = next.id; goto(next.route) }
        }
    }

    function openRetail() { mode.set('retail'); openTab('retail') }
    function openOrder()  { mode.set('order');  openTab('retail') }

    // ── Theme ─────────────────────────────────────────────────────────────────
    let dark = $state(false)
    $effect(() => {
        document.documentElement.setAttribute('data-theme', dark ? 'bersih-dark' : 'bersih')
    })

    // ── Drawer ────────────────────────────────────────────────────────────────
    let drawerOpen = $state(false)

    // ── Avatar dropdown ───────────────────────────────────────────────────────
    let ddOpen = $state(false)

    $effect(() => {
        const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-dd]')) ddOpen = false }
        document.addEventListener('click', close)
        return () => document.removeEventListener('click', close)
    })

    // ── Keyboard ─────────────────────────────────────────────────────────────
    $effect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { drawerOpen = false; ddOpen = false } }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    })

    // ── Session reads ─────────────────────────────────────────────────────────
    let session = $state(get(auth))
    auth.subscribe(v => { session = v })

    let initials = $derived((session?.userName ?? 'U').slice(0, 2).toUpperCase())
    let greeting = $derived((() => {
        const h = new Date().getHours()
        return h < 12 ? 'Pagi' : h < 17 ? 'Siang' : 'Malam'
    })())

    const VERSION = '0.1.0'
</script>

<!-- ══════════════════ NAVBAR ══════════════════ -->
<nav class="fixed top-0 left-0 right-0 z-[200] h-[56px] bg-base-100 border-b border-[var(--border)] flex items-center gap-[6px] px-3 shadow-sm">

    <button class="btn btn-ghost btn-sm btn-square" onclick={() => drawerOpen = true}>
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>
        </svg>
    </button>

    <span class="text-[14px] font-bold tracking-tight shrink-0 select-none">
        Studio <span class="text-[var(--primary)]">Bersih</span>
    </span>
    <div class="w-px h-5 bg-[var(--border)] shrink-0"></div>

    <button class="btn btn-primary btn-sm gap-1.5 shrink-0" onclick={openRetail}>
        <svg class="w-[13px] h-[13px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
        </svg>
        Retail
    </button>
    <button class="btn btn-outline btn-primary btn-sm gap-1.5 shrink-0" onclick={openOrder}>
        <svg class="w-[13px] h-[13px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
        </svg>
        Order
    </button>

    <!-- Tab strip -->
    <div class="flex-1 min-w-0 flex items-center gap-[3px] overflow-x-auto scrollbar-none px-1">
        {#each tabs as tab (tab.id)}
            {@const isActive = tab.id === activeTab}
            <div
                class="flex items-center gap-[6px] px-[10px] h-[34px] rounded-[7px] text-[12px] font-medium shrink-0 cursor-pointer transition-all border relative
                    {isActive ? 'bg-[var(--tab-active-bg)] text-[var(--primary)] border-[rgba(194,98,42,0.25)] font-semibold' : 'text-[var(--text-muted)] border-transparent hover:bg-base-200 hover:text-[var(--text)]'}"
                onclick={() => { activeTab = tab.id; goto(tab.route) }}
            >
                {#if isActive}<span class="absolute bottom-[-1px] left-2 right-2 h-[2px] bg-[var(--primary)] rounded-full"></span>{/if}
                <img src="/icons/{tab.icon}.svg" alt="" class="w-[13px] h-[13px] shrink-0 opacity-70" />
                <span>{tab.label}</span>
                <span class="w-[15px] h-[15px] rounded-sm flex items-center justify-center text-[var(--text-faint)] hover:bg-error/15 hover:text-error ml-[2px]"
                    onclick|stopPropagation={() => closeTab(tab.id)}>
                    <svg class="w-[9px] h-[9px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                    </svg>
                </span>
            </div>
        {/each}
        <button class="w-[26px] h-[26px] rounded-[6px] border border-dashed border-[var(--border)] flex items-center justify-center text-[var(--text-faint)] hover:border-[var(--primary)] hover:text-[var(--primary)] hover:bg-[var(--primary-dim)] transition-all shrink-0" title="Buka fitur baru">
            <svg class="w-[12px] h-[12px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14"/><path d="M12 5v14"/>
            </svg>
        </button>
    </div>

    <!-- Greeting -->
    <div class="flex flex-col justify-center items-end shrink-0 leading-none">
        <span class="text-[12px] font-semibold text-[var(--text)]">Selamat {greeting}, {session?.userName ?? '—'} 👋</span>
        <span class="text-[10px] font-mono text-[var(--text-faint)] mt-[2px]">{session?.outletName ?? '—'} · v{VERSION}</span>
    </div>
    <div class="w-px h-5 bg-[var(--border)] shrink-0"></div>

    <!-- Theme toggle -->
    <svg class="w-[14px] h-[14px] shrink-0 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-14.93 1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2m-4.34-7.07-1.41 1.41M6.34 17.66l-1.41 1.41"/>
    </svg>
    <div class="w-[38px] h-[20px] rounded-full border border-[var(--border)] relative cursor-pointer transition-colors duration-250 shrink-0"
        style:background={dark ? 'var(--primary)' : 'var(--border)'}
        onclick={() => dark = !dark}>
        <div class="absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform duration-220"
            style:transform={dark ? 'translateX(18px)' : 'translateX(0)'}></div>
    </div>
    <svg class="w-[14px] h-[14px] shrink-0 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
    </svg>

    <!-- Avatar dropdown -->
    <div class="relative shrink-0" data-dd>
        <div class="w-[32px] h-[32px] rounded-full flex items-center justify-center text-[11px] font-bold text-white cursor-pointer border-2 border-transparent transition-all hover:border-[var(--primary)] hover:shadow-[0_0_0_3px_var(--primary-dim)] select-none"
            style:background="var(--primary)"
            onclick={() => ddOpen = !ddOpen}>
            {initials}
        </div>
        {#if ddOpen}
            <div class="absolute top-[calc(100%+10px)] right-0 bg-base-100 border border-[var(--border)] rounded-[12px] shadow-xl min-w-[210px] overflow-hidden z-[999]">
                <div class="px-4 py-[13px] border-b border-[var(--border)]">
                    <div class="text-[13px] font-bold text-[var(--text)]">{session?.userName ?? '—'}</div>
                    <div class="text-[11px] text-[var(--text-muted)] mt-px capitalize">{session?.role ?? '—'}</div>
                    <div class="text-[10px] font-mono text-[var(--text-faint)] mt-[2px]">NIP: {session?.nip ?? '—'} · {session?.outletName ?? '—'}</div>
                </div>
                <button class="w-full flex items-center gap-[10px] px-4 py-[10px] text-[13px] font-medium text-[var(--text-muted)] hover:bg-base-200 hover:text-[var(--text)] transition-colors">
                    <svg class="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                    Pengaturan
                </button>
                <div class="h-px bg-[var(--border)] my-1"></div>
                <button class="w-full flex items-center gap-[10px] px-4 py-[10px] text-[13px] font-medium text-error hover:bg-error/10 transition-colors" onclick={forceWipe}>
                    <svg class="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>
                    </svg>
                    Keluar
                </button>
            </div>
        {/if}
    </div>
</nav>

<!-- ══════════════════ DRAWER ══════════════════ -->
{#if drawerOpen}
    <div class="fixed inset-0 z-[300] bg-black/45 backdrop-blur-[2px]" onclick={() => drawerOpen = false}></div>
{/if}
<aside class="fixed top-0 left-0 bottom-0 z-[400] w-[252px] flex flex-col shadow-2xl transition-transform duration-[280ms] ease-[cubic-bezier(0.32,0,0.12,1)]"
    style:background="var(--drawer-bg)"
    style:transform={drawerOpen ? 'translateX(0)' : 'translateX(-100%)'}>

    <div class="h-[56px] flex items-center justify-between px-[14px] border-b border-white/[0.06] shrink-0">
        <span class="text-[14px] font-bold select-none" style:color="var(--drawer-text)">
            Studio <span style:color="var(--primary)">Bersih</span>
        </span>
        <button class="w-[29px] h-[29px] rounded-[6px] border border-white/10 flex items-center justify-center hover:bg-white/[0.07]" style:color="var(--drawer-muted)" onclick={() => drawerOpen = false}>
            <svg class="w-[12px] h-[12px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
        </button>
    </div>

    <nav class="flex-1 px-2 py-[10px] flex flex-col gap-[2px] overflow-y-auto">
        <span class="text-[10px] font-semibold uppercase tracking-[0.1em] px-[10px] py-[10px] pb-[5px]" style:color="var(--drawer-muted)">Outlet</span>
        {#each FEATURES as f}
            {@const isActive = page.url.pathname.startsWith(f.route)}
            <button class="w-full flex items-center gap-[10px] px-[10px] py-[9px] rounded-[7px] text-[13px] font-medium transition-all cursor-pointer text-left
                    {isActive ? 'bg-[var(--primary)] text-white' : 'hover:bg-white/[0.07]'}"
                style:color={isActive ? undefined : 'var(--drawer-muted)'}
                onclick={() => { openTab(f.id); drawerOpen = false }}>
                <img src="/icons/{f.icon}.svg" alt="" class="w-[14px] h-[14px] shrink-0 opacity-80" />
                {f.label}
            </button>
        {/each}
    </nav>

    <div class="px-2 py-[10px] border-t border-white/[0.06] shrink-0">
        <div class="flex items-center gap-[10px] px-[10px] py-[9px]">
            <div class="w-[27px] h-[27px] rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 select-none" style:background="var(--primary)">{initials}</div>
            <div>
                <div class="text-[12px] font-semibold" style:color="var(--drawer-text)">{session?.userName ?? '—'}</div>
                <div class="text-[10px]" style:color="var(--drawer-muted)">{session?.role ?? '—'} · {session?.outletName ?? '—'}</div>
            </div>
        </div>
    </div>
</aside>

<!-- ══════════════════ CONTENT ══════════════════ -->
{#if tabs.length === 0}
    <div class="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] mt-[56px] px-5 py-10 text-center">
        <div class="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center mb-[18px] border"
             style:background="var(--primary-dim)" style:border-color="rgba(194,98,42,0.2)" style:color="var(--primary)">
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>
            </svg>
        </div>
        <h2 class="text-[20px] font-bold tracking-tight text-[var(--text)] mb-[7px]">Mau mulai dari mana?</h2>
        <p class="text-[14px] text-[var(--text-muted)] max-w-[380px] leading-relaxed mb-7">
            Pilih fitur di bawah untuk membukanya sebagai tab. Kamu bisa membuka beberapa fitur sekaligus dan berpindah bebas.
        </p>
        <div class="grid grid-cols-3 gap-[9px] max-w-[540px] w-full">
            {#each FEATURES as f}
                <button class="bg-base-100 border border-[var(--border)] rounded-[12px] p-[15px] flex flex-col items-center gap-[7px] text-center cursor-pointer transition-all hover:border-[var(--primary)] hover:shadow-[0_4px_16px_rgba(194,98,42,0.12)] hover:-translate-y-[2px]"
                    onclick={() => openTab(f.id)}>
                    <img src="/icons/{f.icon}.svg" alt="" class="w-5 h-5" />
                    <span class="text-[12px] font-semibold text-[var(--text)]">{f.label}</span>
                    <span class="text-[10px] text-[var(--text-muted)] leading-snug">{f.desc}</span>
                </button>
            {/each}
        </div>
        <div class="mt-[22px] text-[11px] text-[var(--text-faint)] flex items-center gap-[6px] flex-wrap justify-center">
            <kbd class="bg-base-200 border border-[var(--border)] border-b-2 rounded px-[6px] py-[1px] text-[10px] font-mono text-[var(--text-muted)]">Retail</kbd>
            atau
            <kbd class="bg-base-200 border border-[var(--border)] border-b-2 rounded px-[6px] py-[1px] text-[10px] font-mono text-[var(--text-muted)]">Order</kbd>
            di navbar untuk mulai cepat
        </div>
    </div>
{:else}
    <div class="pt-[56px]">
        {@render children()}
    </div>
{/if}
