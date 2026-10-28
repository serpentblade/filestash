import { ApiError } from "$lib/api/http"
import { session } from "$lib/session.svelte"

// A session that expired opens the login dialog; anything else is the caller's to show.
export function handlePollError(err: unknown, show: (failed: boolean) => void) {
  if (err instanceof ApiError && err.code === "FORBIDDEN") session.requireLogin()
  show(true)
}

// Runs `fn` every `ms`. The first call is immediate even in a hidden tab; later ticks pause while
// hidden and resume immediately on becoming visible. Never overlaps itself or stacks timers.
// Errors go to `onError` and polling continues. Returns a stop function.
export function poll(
  fn: () => Promise<void> | void,
  ms: number,
  skip: () => boolean = () => false,
  onError: (err: unknown) => void = () => {},
) {
  let timer: ReturnType<typeof setInterval> | undefined
  let running = false
  let stopped = false

  async function tick(first = false) {
    if (stopped || running || (!first && (document.hidden || skip()))) return
    running = true
    try {
      await fn()
    } catch (err) {
      if (!stopped) onError(err)
    } finally {
      running = false
    }
  }
  function start() {
    if (timer !== undefined || stopped) return
    void tick(true)
    timer = setInterval(() => void tick(), ms)
  }
  function halt() {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
  }
  function onVisibility() {
    halt()
    start()
  }

  document.addEventListener("visibilitychange", onVisibility)
  start()
  return () => {
    stopped = true
    halt()
    document.removeEventListener("visibilitychange", onVisibility)
  }
}
