import { describe, expect, it, vi } from 'vitest'

import { forwardAbort, isAbortError } from '../../src/lib/abort.js'

describe('abort helpers', () => {
  it('recognizes abort errors without treating ordinary failures as cancellation', () => {
    expect(isAbortError(new DOMException('cancelled', 'AbortError'))).toBe(true)
    expect(isAbortError(new Error('failed'))).toBe(false)
  })

  it('immediately forwards an already-aborted source and preserves its reason', () => {
    const reason = new DOMException('cancelled', 'AbortError')
    const source = new AbortController()
    const target = new AbortController()
    source.abort(reason)

    const stopForwarding = forwardAbort(source.signal, target)

    expect(target.signal.aborted).toBe(true)
    expect(target.signal.reason).toBe(reason)
    expect(stopForwarding).toEqual(expect.any(Function))
  })

  it('forwards future cancellation exactly once', () => {
    const source = new AbortController()
    const target = new AbortController()
    const abort = vi.spyOn(target, 'abort')
    const reason = new DOMException('cancelled', 'AbortError')
    forwardAbort(source.signal, target)

    source.abort(reason)

    expect(abort).toHaveBeenCalledOnce()
    expect(abort).toHaveBeenCalledWith(reason)
  })

  it('detaches forwarding when the returned cleanup runs', () => {
    const source = new AbortController()
    const target = new AbortController()
    const stopForwarding = forwardAbort(source.signal, target)

    stopForwarding()
    source.abort()

    expect(target.signal.aborted).toBe(false)
  })

  it('returns harmless cleanup when there is no source signal', () => {
    const target = new AbortController()

    expect(() => forwardAbort(undefined, target)()).not.toThrow()
    expect(target.signal.aborted).toBe(false)
  })
})
