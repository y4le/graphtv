export function createTooltip(container) {
  const tooltip = document.createElement('div')
  tooltip.className = 'chart-tooltip'
  tooltip.hidden = true
  container.appendChild(tooltip)

  return {
    show(content, position) {
      tooltip.innerHTML = content
      tooltip.hidden = false
      tooltip.style.left = `${position.x}px`
      tooltip.style.top = `${position.y}px`
    },
    hide() {
      tooltip.hidden = true
    }
  }
}

export function getTooltipContent(point) {
  const ratings = point.ratings
    .map((rating) =>
      typeof rating.rating === 'number'
        ? `<li>${rating.source.toUpperCase()}: ${rating.rating.toFixed(1)}${
            typeof rating.votes === 'number' ? ` · ${rating.votes.toLocaleString()} votes` : ''
          }</li>`
        : `<li>${rating.source.toUpperCase()}: n/a</li>`
    )
    .join('')

  return `
    <div class="chart-tooltip-card">
      <p class="tooltip-kicker">S${String(point.season).padStart(2, '0')}E${String(point.episode).padStart(2, '0')}</p>
      <h3>${point.title}</h3>
      <p>${point.date ?? 'Unknown air date'}</p>
      <ul>${ratings}</ul>
      ${point.plot ? `<p class="tooltip-plot">${point.plot}</p>` : ''}
    </div>
  `
}
