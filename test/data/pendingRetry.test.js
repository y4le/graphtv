import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  PENDING_RETRY_ATTEMPTS,
  PENDING_RETRY_DEADLINE_MS,
  PENDING_RETRY_DEFAULT_DELAY_MS,
  isPendingError,
  withPendingRetry
} from '../../src/data/pendingRetry.js'

function pendingError(retryAfterMs = null, message = 'Still pending') {
  const error = new Error(message)
  error.pending = true
  error.retryAfterMs = retryAfterMs
  return error
}

function createClock() {
  let current = 0
  const waits = []
  return {
    now: () => current,
    wait: vi.fn(async (delayMs) => {
      waits.push(delayMs)
      current += delayMs
    }),
    waits,
    advance(delayMs) {
      current += delayMs
    }
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('pending retry policy', () => {
  it('exports the bounded page policy', () => {
    expect(PENDING_RETRY_ATTEMPTS).toBe(3)
    expect(PENDING_RETRY_DEFAULT_DELAY_MS).toBe(1_000)
    expect(PENDING_RETRY_DEADLINE_MS).toBe(15_000)
    expect(isPendingError(pendingError())).toBe(true)
    expect(isPendingError(new Error('failed'))).toBe(false)
  })

  it('returns a first-attempt success without waiting', async () => {
    const clock = createClock()
    const run = vi.fn().mockResolvedValue('ready')

    await expect(withPendingRetry(run, clock)).resolves.toBe('ready')
    expect(run).toHaveBeenCalledOnce()
    expect(clock.wait).not.toHaveBeenCalled()
  })

  it('honors each server delay across three total attempts', async () => {
    const clock = createClock()
    const run = vi
      .fn()
      .mockRejectedValueOnce(pendingError(1_000))
      .mockRejectedValueOnce(pendingError(5_000))
      .mockResolvedValueOnce('ready')

    await expect(withPendingRetry(run, clock)).resolves.toBe('ready')
    expect(run).toHaveBeenCalledTimes(3)
    expect(clock.waits).toEqual([1_000, 5_000])
  })

  it('distinguishes an absent delay from an immediate retry', async () => {
    const clock = createClock()
    const run = vi
      .fn()
      .mockRejectedValueOnce(pendingError(null))
      .mockRejectedValueOnce(pendingError(0))
      .mockResolvedValueOnce('ready')

    await expect(withPendingRetry(run, clock)).resolves.toBe('ready')
    expect(clock.waits).toEqual([1_000, 0])
  })

  it('rethrows the last pending error after three attempts', async () => {
    const clock = createClock()
    const finalError = pendingError(null, 'Hydration did not finish')
    const run = vi
      .fn()
      .mockRejectedValueOnce(pendingError())
      .mockRejectedValueOnce(pendingError())
      .mockRejectedValueOnce(finalError)

    await expect(withPendingRetry(run, clock)).rejects.toBe(finalError)
    expect(run).toHaveBeenCalledTimes(3)
    expect(clock.waits).toEqual([1_000, 1_000])
  })

  it('does not retry early when the server delay exceeds the budget', async () => {
    const clock = createClock()
    const error = pendingError(30_000)
    const run = vi.fn().mockRejectedValue(error)

    await expect(withPendingRetry(run, clock)).rejects.toBe(error)
    expect(run).toHaveBeenCalledOnce()
    expect(clock.wait).not.toHaveBeenCalled()
  })

  it('does not retry after an attempt consumes the remaining budget', async () => {
    const clock = createClock()
    const error = pendingError(1_000)
    const run = vi.fn(async () => {
      clock.advance(PENDING_RETRY_DEADLINE_MS)
      throw error
    })

    await expect(withPendingRetry(run, clock)).rejects.toBe(error)
    expect(run).toHaveBeenCalledOnce()
    expect(clock.wait).not.toHaveBeenCalled()
  })

  it('passes an ordinary failure through without retrying', async () => {
    const clock = createClock()
    const error = new Error('Unavailable')
    const run = vi.fn().mockRejectedValue(error)

    await expect(withPendingRetry(run, clock)).rejects.toBe(error)
    expect(run).toHaveBeenCalledOnce()
    expect(clock.wait).not.toHaveBeenCalled()
  })

  it('does not start work for an already-aborted caller', async () => {
    const controller = new AbortController()
    const reason = new DOMException('Cancelled', 'AbortError')
    controller.abort(reason)
    const run = vi.fn()

    await expect(
      withPendingRetry(run, { signal: controller.signal })
    ).rejects.toBe(reason)
    expect(run).not.toHaveBeenCalled()
  })

  it('interrupts a pending wait when its caller aborts', async () => {
    const controller = new AbortController()
    const reason = new DOMException('Cancelled', 'AbortError')
    const run = vi.fn().mockRejectedValue(pendingError(1_000))
    const wait = vi.fn(async (_delayMs, signal) => {
      controller.abort(reason)
      signal.throwIfAborted()
    })

    await expect(
      withPendingRetry(run, { signal: controller.signal, wait })
    ).rejects.toBe(reason)
    expect(run).toHaveBeenCalledOnce()
  })

  it('uses an abortable production timer when no wait is injected', async () => {
    vi.useFakeTimers()
    const run = vi
      .fn()
      .mockRejectedValueOnce(pendingError(25))
      .mockResolvedValueOnce('ready')

    const result = withPendingRetry(run)
    await vi.advanceTimersByTimeAsync(25)

    await expect(result).resolves.toBe('ready')
    expect(run).toHaveBeenCalledTimes(2)
  })
})
