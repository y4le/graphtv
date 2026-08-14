export function isAbortError(error) {
  return error?.name === 'AbortError'
}

export function forwardAbort(sourceSignal, targetController) {
  if (!sourceSignal) {
    return () => {}
  }

  if (sourceSignal.aborted) {
    targetController.abort(sourceSignal.reason)
    return () => {}
  }

  const handleAbort = () => targetController.abort(sourceSignal.reason)
  sourceSignal.addEventListener('abort', handleAbort, { once: true })

  return () => sourceSignal.removeEventListener('abort', handleAbort)
}
