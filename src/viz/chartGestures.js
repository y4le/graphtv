import { clampViewport } from './scales.js'

const MOUSE_SCRUB_START_TOLERANCE_PX = 4
const PEN_SCRUB_START_TOLERANCE_PX = 6
const TOUCH_DRAG_START_TOLERANCE_PX = 9
const TOUCH_SCRUB_HOLD_MS = 300
const SUPPRESS_CLICK_DURATION_MS = 350
const FLING_FRICTION = 0.95
const FLING_MIN_VELOCITY = 0.3

export function createChartGestureController({
  bodyShell,
  getModel,
  getViewport,
  setViewport,
  onInteraction,
  onClearTrendHover,
  onPrepareScrub,
  onScrubPreview,
  onClearScrubPreview,
  onCommitScrub,
  onRender,
  onViewportSettled
}) {
  let gesture = null
  let scrubArmTimer = null
  let suppressClickUntil = 0
  let flingFrame = null
  let destroyed = false

  function clearScrubArmTimer() {
    if (!scrubArmTimer) {
      return
    }
    clearTimeout(scrubArmTimer)
    scrubArmTimer = null
  }

  function getPointerType(event) {
    return event.pointerType || 'mouse'
  }

  function getPointerCoordinate(event, key) {
    return Number.isFinite(event[key]) ? event[key] : 0
  }

  function isScrubStartTarget(event) {
    return !event.target.closest?.(
      '.episode-point, .episode-point-hit, .episode-point-hit-batch, .season-axis-label'
    )
  }

  function beginScrub(pointerId, pointerType, clientX) {
    clearScrubArmTimer()
    onPrepareScrub()
    gesture.type = 'scrub'
    gesture.pointerType = pointerType
    bodyShell.classList.add('is-scrubbing')
    bodyShell.setPointerCapture?.(pointerId)
    onScrubPreview(clientX, { force: true })
  }

  function clearScrubPreview() {
    bodyShell.classList.remove('is-scrubbing')
    onClearScrubPreview()
  }

  function cancelScrub({ inert = false } = {}) {
    if (gesture?.type !== 'scrub') {
      return false
    }

    clearScrubPreview()
    if (inert) {
      gesture.type = 'scrub-cancelled'
      suppressClickUntil = performance.now() + SUPPRESS_CLICK_DURATION_MS
    }
    onRender()
    return true
  }

  function commitScrub() {
    bodyShell.classList.remove('is-scrubbing')
    gesture = null
    suppressClickUntil = performance.now() + SUPPRESS_CLICK_DURATION_MS
    onCommitScrub()
  }

  function stopFling() {
    if (flingFrame) {
      cancelAnimationFrame(flingFrame)
      flingFrame = null
    }
  }

  function shouldSuppressClick() {
    if (performance.now() >= suppressClickUntil) {
      suppressClickUntil = 0
      return false
    }

    suppressClickUntil = 0
    return true
  }

  function startFling(velocityPxPerMs) {
    stopFling()
    const viewport = getViewport()
    const chartWidth = Math.max(bodyShell.clientWidth, 240)
    const viewportWidth = viewport.end - viewport.start
    const pixelsPerEpisode = chartWidth / viewportWidth
    let velocity = (-velocityPxPerMs * 16) / pixelsPerEpisode

    function step() {
      velocity *= FLING_FRICTION
      if (Math.abs(velocity) < FLING_MIN_VELOCITY / pixelsPerEpisode) {
        flingFrame = null
        onViewportSettled()
        return
      }
      const previous = getViewport()
      const next = clampViewport(
        {
          start: previous.start + velocity,
          end: previous.end + velocity
        },
        getModel()
      )
      setViewport(next)
      if (next.start === previous.start && next.end === previous.end) {
        flingFrame = null
        onViewportSettled()
        return
      }
      onRender()
      flingFrame = requestAnimationFrame(step)
    }

    flingFrame = requestAnimationFrame(step)
  }

  function handlePointerDown(event) {
    onInteraction()
    const viewport = getViewport()
    if (!viewport) {
      return
    }

    const pointerType = getPointerType(event)
    const clientX = getPointerCoordinate(event, 'clientX')
    const clientY = getPointerCoordinate(event, 'clientY')

    if (pointerType !== 'touch') {
      if (
        gesture ||
        !isScrubStartTarget(event) ||
        event.isPrimary === false ||
        (event.button != null && event.button !== 0) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return
      }

      gesture = {
        type: 'pressing',
        pointerType,
        pointers: new Map([[event.pointerId, clientX]]),
        startX: clientX,
        startY: clientY
      }
      return
    }

    if (!gesture) {
      const stoppedFling = Boolean(flingFrame)
      stopFling()
      suppressClickUntil = stoppedFling
        ? performance.now() + SUPPRESS_CLICK_DURATION_MS
        : 0
      onClearTrendHover()
      gesture = {
        type: 'pending',
        pointerType,
        pointers: new Map([[event.pointerId, clientX]]),
        startX: clientX,
        startY: clientY,
        startViewport: { ...viewport },
        prevX: clientX,
        prevTime: performance.now(),
        velocity: 0,
        viewportChanged: stoppedFling
      }

      if (isScrubStartTarget(event)) {
        scrubArmTimer = setTimeout(() => {
          scrubArmTimer = null
          if (
            destroyed ||
            gesture?.type !== 'pending' ||
            gesture.pointers.size !== 1 ||
            !gesture.pointers.has(event.pointerId)
          ) {
            return
          }
          beginScrub(
            event.pointerId,
            pointerType,
            gesture.pointers.get(event.pointerId)
          )
        }, TOUCH_SCRUB_HOLD_MS)
      }
      return
    }

    if (!gesture.pointers || gesture.pointerType !== 'touch') {
      return
    }

    const wasScrubbing = gesture.type === 'scrub'
    if (wasScrubbing) {
      clearScrubPreview()
    }
    clearScrubArmTimer()
    gesture.pointers.set(event.pointerId, clientX)
    if (gesture.pointers.size >= 2) {
      const xs = Array.from(gesture.pointers.values())
      for (const pointerId of gesture.pointers.keys()) {
        bodyShell.setPointerCapture?.(pointerId)
      }
      gesture = {
        type: 'pinch',
        pointers: gesture.pointers,
        initialSpan: Math.max(Math.abs(xs[1] - xs[0]), 1),
        startViewport: { ...getViewport() },
        viewportChanged: gesture.viewportChanged
      }
      if (wasScrubbing) {
        onRender()
      }
    }
  }

  function handlePointerMove(event) {
    if (!gesture?.pointers?.has(event.pointerId)) {
      return
    }

    const pointerType = getPointerType(event)
    const clientX = getPointerCoordinate(event, 'clientX')
    const clientY = getPointerCoordinate(event, 'clientY')
    gesture.pointers.set(event.pointerId, clientX)

    if (gesture.type === 'scrub') {
      event.preventDefault()
      onScrubPreview(clientX)
      return
    }

    if (gesture.type === 'scrub-cancelled') {
      return
    }

    if (gesture.type === 'pressing') {
      const tolerance =
        pointerType === 'pen'
          ? PEN_SCRUB_START_TOLERANCE_PX
          : MOUSE_SCRUB_START_TOLERANCE_PX
      if (
        Math.hypot(clientX - gesture.startX, clientY - gesture.startY) <
        tolerance
      ) {
        return
      }

      event.preventDefault()
      beginScrub(event.pointerId, pointerType, clientX)
      return
    }

    if (pointerType !== 'touch') {
      return
    }

    if (gesture.type === 'pinch') {
      event.preventDefault()
      const xs = Array.from(gesture.pointers.values())
      const currentSpan = Math.abs(xs[1] - xs[0])
      const scale = gesture.initialSpan / Math.max(currentSpan, 1)
      const startWidth =
        gesture.startViewport.end - gesture.startViewport.start + 1
      const startCenter = gesture.startViewport.start + (startWidth - 1) / 2
      const newWidth = Math.max(2, Math.round(startWidth * scale))
      const previous = getViewport()
      const next = clampViewport(
        {
          start: startCenter - (newWidth - 1) / 2,
          end: startCenter + (newWidth - 1) / 2
        },
        getModel()
      )
      setViewport(next)
      gesture.viewportChanged ||=
        next.start !== previous.start || next.end !== previous.end
      onRender()
      return
    }

    const now = performance.now()
    const dt = now - gesture.prevTime
    if (dt > 0) {
      const instantVelocity = (clientX - gesture.prevX) / dt
      gesture.velocity = gesture.velocity * 0.4 + instantVelocity * 0.6
    }
    gesture.prevX = clientX
    gesture.prevTime = now

    const deltaX = clientX - gesture.startX
    const deltaY = clientY - gesture.startY
    if (
      gesture.type === 'pending' &&
      Math.hypot(deltaX, deltaY) >= TOUCH_DRAG_START_TOLERANCE_PX
    ) {
      clearScrubArmTimer()
    }
    if (
      gesture.type === 'pending' &&
      Math.abs(deltaX) < TOUCH_DRAG_START_TOLERANCE_PX
    ) {
      return
    }

    event.preventDefault()
    if (gesture.type === 'pending') {
      bodyShell.setPointerCapture?.(event.pointerId)
    }
    gesture.type = 'pan'
    const chartWidth = Math.max(bodyShell.clientWidth, 240)
    const viewportWidth =
      gesture.startViewport.end - gesture.startViewport.start
    const pixelsPerEpisode = chartWidth / viewportWidth
    const deltaEpisodes = -deltaX / pixelsPerEpisode
    const previous = getViewport()
    const next = clampViewport(
      {
        start: gesture.startViewport.start + deltaEpisodes,
        end: gesture.startViewport.end + deltaEpisodes
      },
      getModel()
    )
    setViewport(next)
    gesture.viewportChanged ||=
      next.start !== previous.start || next.end !== previous.end
    onRender()
  }

  function handlePointerEnd(event) {
    if (!gesture || !gesture.pointers.has(event.pointerId)) {
      return
    }

    clearScrubArmTimer()

    if (gesture.type === 'scrub') {
      if (bodyShell.hasPointerCapture?.(event.pointerId)) {
        bodyShell.releasePointerCapture(event.pointerId)
      }
      if (event.type === 'pointercancel') {
        cancelScrub()
        gesture = null
      } else {
        commitScrub()
      }
      return
    }

    if (gesture.type === 'pressing' || gesture.type === 'scrub-cancelled') {
      if (bodyShell.hasPointerCapture?.(event.pointerId)) {
        bodyShell.releasePointerCapture(event.pointerId)
      }
      if (gesture.type === 'scrub-cancelled') {
        suppressClickUntil = performance.now() + SUPPRESS_CLICK_DURATION_MS
      }
      gesture = null
      return
    }

    const wasPan = gesture.type === 'pan'
    const velocity = gesture.velocity
    if (bodyShell.hasPointerCapture?.(event.pointerId)) {
      bodyShell.releasePointerCapture(event.pointerId)
    }

    gesture.pointers.delete(event.pointerId)

    if (gesture.pointers.size === 0) {
      const { viewportChanged } = gesture
      const wasDrag = gesture.type !== 'pending'
      if (wasDrag || viewportChanged) {
        suppressClickUntil = performance.now() + SUPPRESS_CLICK_DURATION_MS
      }
      gesture = null

      const shouldFling =
        event.type !== 'pointercancel' && wasPan && Math.abs(velocity) > 0.15
      if (shouldFling) {
        startFling(velocity)
      } else if (viewportChanged) {
        onViewportSettled()
      }
      return
    }

    if (gesture.type === 'pinch' && gesture.pointers.size === 1) {
      const [, x] = gesture.pointers.entries().next().value
      gesture = {
        type: 'pending',
        pointerType: 'touch',
        pointers: gesture.pointers,
        startX: x,
        startY: 0,
        startViewport: { ...getViewport() },
        prevX: x,
        prevTime: performance.now(),
        velocity: 0,
        viewportChanged: gesture.viewportChanged
      }
      suppressClickUntil = performance.now() + SUPPRESS_CLICK_DURATION_MS
    }
  }

  function handleScrubTouchMove(event) {
    if (gesture?.type === 'scrub') {
      event.preventDefault()
    }
  }

  bodyShell.addEventListener('pointerdown', handlePointerDown)
  bodyShell.addEventListener('pointermove', handlePointerMove)
  bodyShell.addEventListener('pointerup', handlePointerEnd)
  bodyShell.addEventListener('pointercancel', handlePointerEnd)
  document.addEventListener('pointerup', handlePointerEnd)
  document.addEventListener('pointercancel', handlePointerEnd)
  bodyShell.addEventListener('touchmove', handleScrubTouchMove, {
    passive: false
  })

  return {
    cancelScrub,
    isActive: () => Boolean(gesture),
    isFlinging: () => Boolean(flingFrame),
    isScrubbing: () => gesture?.type === 'scrub',
    shouldSuppressClick,
    destroy() {
      destroyed = true
      stopFling()
      clearScrubArmTimer()
      bodyShell.classList.remove('is-scrubbing')
      bodyShell.removeEventListener('pointerdown', handlePointerDown)
      bodyShell.removeEventListener('pointermove', handlePointerMove)
      bodyShell.removeEventListener('pointerup', handlePointerEnd)
      bodyShell.removeEventListener('pointercancel', handlePointerEnd)
      document.removeEventListener('pointerup', handlePointerEnd)
      document.removeEventListener('pointercancel', handlePointerEnd)
      bodyShell.removeEventListener('touchmove', handleScrubTouchMove)
    }
  }
}
