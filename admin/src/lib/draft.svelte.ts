import { addGuard, type Route } from "$lib/router"
import { t } from "$lib/i18n"
import { confirm } from "$lib/confirm.svelte"

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

// a missing key and an empty object are equal: section scaffolding is never an edit
export function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === undefined && isPlain(b)) return Object.keys(b).length === 0
  if (b === undefined && isPlain(a)) return Object.keys(a).length === 0
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  return [...new Set([...Object.keys(ra), ...Object.keys(rb)])].every((k) => equal(ra[k], rb[k]))
}

export function createDraft<T>(initial: T, opts: { stays?: (to: Route | null) => boolean } = {}) {
  let baseline = $state.snapshot(initial) as T
  let value = $state($state.snapshot(initial) as T)

  const dirty = () => !equal($state.snapshot(value), baseline)

  const dispose = addGuard({
    isDirty: dirty,
    stays: opts.stays,
    confirm: () =>
      confirm({
        title: t("Discard unsaved changes?"),
        body: t("You have unsaved changes on this page. Leave without saving?"),
        confirmLabel: t("Discard"),
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
    // the last loaded or saved value
    get baseline() {
      return baseline
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
