export function renderAppShell(container) {
  container.innerHTML = `
    <main class="app-shell">
      <section class="hero">
        <p class="eyebrow">GraphTV</p>
        <h1>Rebuilding the app around bundled data, D3, and multi-provider ratings.</h1>
        <p class="lede">The initial scaffold is in place. Search, provider integration, and the chart layer land next.</p>
      </section>
    </main>
  `
}
