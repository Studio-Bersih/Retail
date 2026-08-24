<script lang="ts">
	// Scaffold check page. Delete this once real routes exist — it is here to
	// prove Tailwind utilities, daisyUI components and theme switching all work.
	let theme = $state<'light' | 'dark'>('light');

	function toggle() {
		theme = theme === 'light' ? 'dark' : 'light';
		document.documentElement.setAttribute('data-theme', theme);
	}
</script>

<div class="min-h-screen bg-base-200 p-8">
	<div class="mx-auto max-w-3xl space-y-6">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-3xl font-bold">Retail POS</h1>
				<p class="text-base-content/60">SvelteKit · Tailwind 4 · daisyUI 5</p>
			</div>
			<button class="btn btn-primary" onclick={toggle}>
				{theme === 'light' ? 'Dark' : 'Light'} theme
			</button>
		</div>

		<div class="alert alert-success">
			<span>Scaffold is working. Tailwind utilities and daisyUI components are both live.</span>
		</div>

		<div class="card bg-base-100 shadow">
			<div class="card-body">
				<h2 class="card-title">Backend</h2>
				<p>
					The <code class="badge badge-ghost">retail</code> MySQL database is already built and
					seeded. Its schema, checks and implementation guide live in
					<code class="badge badge-ghost">../Retail-Backend</code>.
				</p>
				<div class="card-actions justify-end">
					<button class="btn btn-sm btn-outline">Secondary</button>
					<button class="btn btn-sm btn-primary">Primary</button>
				</div>
			</div>
		</div>

		<div class="stats bg-base-100 w-full shadow">
			<div class="stat">
				<div class="stat-title">Tables</div>
				<div class="stat-value text-primary">18</div>
			</div>
			<div class="stat">
				<div class="stat-title">Views</div>
				<div class="stat-value">10</div>
			</div>
			<div class="stat">
				<div class="stat-title">Sample rows</div>
				<div class="stat-value">62k</div>
			</div>
		</div>
	</div>
</div>
