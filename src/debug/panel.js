export function renderDebugPanel(container, sections) {
  container.innerHTML = `
    <details class="debug-panel" open>
      <summary>Debug</summary>
      ${sections
        .map(
          (section) => `
            <section class="debug-section">
              <h3>${section.title}</h3>
              <pre>${escapeHtml(JSON.stringify(section.data, null, 2))}</pre>
            </section>
          `
        )
        .join('')}
    </details>
  `
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
