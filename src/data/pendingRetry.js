export const PENDING_RETRY_ATTEMPTS = 3
export const PENDING_RETRY_DEFAULT_DELAY_MS = 1_000
export const PENDING_RETRY_DEADLINE_MS = 15_000

export function isPendingError(error) {
  return error?.pending === true
}

function waitForDelay(delayMs, signal) {
  signal?.throwIfAborted()
  if (delayMs === 0) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort)
      resolve()
    }, delayMs)
    const handleAbort = () => {
      clearTimeout(timeout)
      reject(signal.reason)
    }
    signal?.addEventListener('abort', handleAbort, { once: true })
  })
}

export async function withPendingRetry(
  run,
  {
    attempts = PENDING_RETRY_ATTEMPTS,
    defaultDelayMs = PENDING_RETRY_DEFAULT_DELAY_MS,
    deadlineMs = PENDING_RETRY_DEADLINE_MS,
    signal,
    now = () => Date.now(),
    wait = waitForDelay
  } = {}
) {
  const startedAt = now()

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    signal?.throwIfAborted()
    try {
      return await run()
    } catch (error) {
      if (!isPendingError(error) || attempt === attempts - 1) {
        throw error
      }

      const delayMs = error.retryAfterMs ?? defaultDelayMs
      const remainingMs = deadlineMs - (now() - startedAt)
      if (remainingMs <= 0 || delayMs > remainingMs) {
        throw error
      }

      signal?.throwIfAborted()
      await wait(delayMs, signal)
    }
  }

  throw new Error('Pending retry loop exhausted without a result.')
}
