// Runs `fn` every `ms` while the tab is visible. Runs immediately on start and on becoming
// visible again; never overlaps itself or stacks timers. Returns a stop function.
export function poll(fn: () => Promise<void> | void, ms: number, skip: () => boolean = () => false) {
  let timer: ReturnType<typeof setInterval> | undefined
  let running = false
  let stopped = false

  async function tick() {
    if (stopped || running || document.hidden || skip()) return
    running = true
    try {
      await fn()
    } catch {
      // transient failures are retried on the next tick
    } finally {
      running = false
    }
  }
  function start() {
    if (timer !== undefined || stopped) return
    void tick()
    timer = setInterval(tick, ms)
  }
  function halt() {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
  }
  function onVisibility() {
    if (document.hidden) halt()
    else start()
  }

  document.addEventListener("visibilitychange", onVisibility)
  if (!document.hidden) start()
  return () => {
    stopped = true
    halt()
    document.removeEventListener("visibilitychange", onVisibility)
  }
}
