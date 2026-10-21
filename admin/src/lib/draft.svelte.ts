import { addGuard } from "$lib/router"
import { confirm } from "$lib/confirm.svelte"

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => k in b && equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

export function createDraft<T>(initial: T) {
  let baseline = $state.snapshot(initial) as T
  let value = $state($state.snapshot(initial) as T)

  const dirty = () => !equal($state.snapshot(value), baseline)

  const dispose = addGuard({
    isDirty: dirty,
    confirm: () =>
      confirm({
        title: "Discard unsaved changes?",
        body: "You have unsaved changes on this page. Leave without saving?",
        confirmLabel: "Discard",
        destructive: true,
      }),
  })

  function reset(next?: T) {
    if (next !== undefined) baseline = $state.snapshot(next) as T
    value = $state.snapshot(baseline) as T
  }

  return {
    get value() {
      return value
    },
    set value(v: T) {
      value = v
    },
    get dirty() {
      return dirty()
    },
    reset,
    async save(fn: (v: T) => Promise<T | void>): Promise<boolean> {
      try {
        const sent = $state.snapshot(value) as T
        const result = await fn(sent)
        baseline = $state.snapshot(result === undefined ? sent : result) as T
        // keep edits made while the save was in flight; they stay dirty against the new baseline
        if (equal($state.snapshot(value), sent)) value = $state.snapshot(baseline) as T
        return true
      } catch {
        return false
      }
    },
    dispose,
  }
}
