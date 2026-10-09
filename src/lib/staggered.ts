// Staggered ("hedged") execution. The first step starts immediately; the next one
// starts as soon as the previous one fails, or after `hedgeMs` if it is still
// silent. The first accepted value wins and the remaining work is aborted, so a
// slow or broken provider never adds its full timeout to the response time.
export type Step<T> = (signal: AbortSignal) => Promise<T>

export function raceStaggered<T>(
  steps: Step<T>[],
  hedgeMs: number,
  accept: (value: T) => boolean,
  parent?: AbortSignal
): Promise<T | null> {
  if (steps.length === 0 || parent?.aborted) return Promise.resolve(null)
  const controller = new AbortController()

  return new Promise<T | null>((resolve) => {
    let started = 0
    let failed = 0
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const onParentAbort = () => finish(null)
    const finish = (value: T | null) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      parent?.removeEventListener('abort', onParentAbort)
      controller.abort()
      resolve(value)
    }
    const fail = () => {
      failed += 1
      if (settled) return
      if (failed >= steps.length) finish(null)
      else if (started === failed) launchNext()
    }
    const launchNext = () => {
      if (timer) clearTimeout(timer)
      if (settled || started >= steps.length) return
      const step = steps[started++]
      Promise.resolve()
        .then(() => step(controller.signal))
        .then(
          (value) => {
            let ok = false
            try {
              ok = accept(value)
            } catch {
              ok = false
            }
            if (ok) finish(value)
            else fail()
          },
          () => fail()
        )
      if (started < steps.length) timer = setTimeout(launchNext, hedgeMs)
    }

    parent?.addEventListener('abort', onParentAbort, { once: true })
    launchNext()
  })
}
