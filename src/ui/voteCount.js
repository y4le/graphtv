import { escapeHtml } from '../lib/html.js'
import { formatCompactNumber } from '../lib/number.js'

export function renderVoteCount(
  votes,
  { className = null, interactive = true } = {}
) {
  if (!Number.isFinite(votes)) {
    return ''
  }

  const compactVotes = formatCompactNumber(votes)
  const preciseVotes = votes.toLocaleString('en-US')
  const tooltip =
    votes === 1
      ? '1 vote was submitted for this score.'
      : `${preciseVotes} votes were submitted for this score.`
  const classes = ['vote-count-control', className].filter(Boolean).join(' ')
  const trigger = interactive
    ? `<button type="button" class="inline-tooltip-trigger vote-count-trigger" data-inline-tooltip-trigger data-vote-count-trigger aria-label="${escapeHtml(`${compactVotes} ${votes === 1 ? 'vote' : 'votes'}. ${tooltip}`)}" aria-expanded="false"><span aria-hidden="true">(${escapeHtml(compactVotes)})</span></button>`
    : `<span class="inline-tooltip-trigger vote-count-trigger" data-inline-tooltip-trigger data-vote-count-trigger aria-hidden="true">(${escapeHtml(compactVotes)})</span>`

  return `
    <span class="inline-tooltip-control ${classes}" data-inline-tooltip-control data-vote-count-control>
      ${trigger}
      <span class="inline-tooltip vote-count-tooltip" data-inline-tooltip role="tooltip" hidden>${escapeHtml(tooltip)}</span>
    </span>
  `
}

export function bindVoteCountTooltips(root) {
  const ownerDocument = root.ownerDocument

  function getControl(target) {
    const control = target.closest?.('[data-inline-tooltip-control]') ?? null
    return control && root.contains(control) ? control : null
  }

  function sync(control) {
    const expanded = ['hovered', 'focused', 'pinned'].some(
      (state) => control.dataset[state] === 'true'
    )
    control.classList.toggle('is-expanded', expanded)
    const trigger = control.querySelector('[data-inline-tooltip-trigger]')
    if (trigger?.tagName === 'BUTTON') {
      trigger.setAttribute('aria-expanded', String(expanded))
    }
    const tooltip = control.querySelector('[data-inline-tooltip]')
    if (tooltip) {
      tooltip.hidden = !expanded
    }
  }

  function dismiss(control) {
    control.dataset.hovered = 'false'
    control.dataset.focused = 'false'
    control.dataset.pinned = 'false'
    sync(control)
  }

  function dismissOthers(activeControl = null) {
    root
      .querySelectorAll('[data-inline-tooltip-control]')
      .forEach((control) => {
        if (control !== activeControl) {
          dismiss(control)
        }
      })
  }

  function handleClick(event) {
    if (event.defaultPrevented) {
      return
    }

    const trigger = event.target.closest?.('[data-inline-tooltip-trigger]')
    const control = trigger ? getControl(trigger) : null
    if (!control) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const pinned = control.dataset.pinned !== 'true'
    dismissOthers(control)
    control.dataset.pinned = String(pinned)
    if (!pinned) {
      control.dataset.hovered = 'false'
      control.dataset.focused = 'false'
    }
    sync(control)
  }

  function handleMouseOver(event) {
    const control = getControl(event.target)
    if (!control || control.contains(event.relatedTarget)) {
      return
    }

    control.dataset.hovered = 'true'
    sync(control)
  }

  function handleMouseOut(event) {
    const control = getControl(event.target)
    if (!control || control.contains(event.relatedTarget)) {
      return
    }

    control.dataset.hovered = 'false'
    sync(control)
  }

  function handleFocusIn(event) {
    const control = getControl(event.target)
    if (!control) {
      return
    }

    control.dataset.focused = 'true'
    sync(control)
  }

  function handleFocusOut(event) {
    const control = getControl(event.target)
    if (!control || control.contains(event.relatedTarget)) {
      return
    }

    control.dataset.focused = 'false'
    sync(control)
  }

  function handleKeyDown(event) {
    if (event.key !== 'Escape') {
      return
    }

    const control = getControl(event.target)
    if (!control?.classList.contains('is-expanded')) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    dismiss(control)
  }

  function handleDocumentClick(event) {
    const activeControl = getControl(event.target)
    dismissOthers(activeControl)
  }

  root.addEventListener('click', handleClick)
  root.addEventListener('mouseover', handleMouseOver)
  root.addEventListener('mouseout', handleMouseOut)
  root.addEventListener('focusin', handleFocusIn)
  root.addEventListener('focusout', handleFocusOut)
  root.addEventListener('keydown', handleKeyDown)
  ownerDocument.addEventListener('click', handleDocumentClick, true)

  return () => {
    root.removeEventListener('click', handleClick)
    root.removeEventListener('mouseover', handleMouseOver)
    root.removeEventListener('mouseout', handleMouseOut)
    root.removeEventListener('focusin', handleFocusIn)
    root.removeEventListener('focusout', handleFocusOut)
    root.removeEventListener('keydown', handleKeyDown)
    ownerDocument.removeEventListener('click', handleDocumentClick, true)
  }
}
