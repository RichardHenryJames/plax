/**
 * Runs tasks one after another, in the order they were given, like the single disk thread of the native app's view model: what the
 * engine reads and writes (the history, the cache, the saved stories) and the merges that depend on them keep their order, however
 * long each one takes. A task that fails never stops the ones after it.
 */
export class SerialQueue {
  private tail: Promise<void> = Promise.resolve()
  private closed = false

  constructor(private readonly onError: (error: unknown) => void = () => undefined) {}

  /** Queues a task. Once the queue is closed nothing more is accepted (what was queued before still runs). */
  run(task: () => Promise<void> | void): void {
    if (this.closed) return
    this.tail = this.tail.then(async () => {
      try {
        await task()
      } catch (error) {
        this.onError(error)
      }
    })
  }

  /** Accepts no more tasks. Resolves when every task queued so far has run. */
  close(): Promise<void> {
    this.closed = true
    return this.tail
  }

  /** Resolves when every task queued so far has run. */
  drained(): Promise<void> {
    return this.tail
  }
}
