import type { HistoryItem, Step, StepSpec, Workflow } from "$lib/types"

export type { HistoryItem, Step, StepSpec, Workflow }

export function newWorkflowId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// The server stores string params only; empty values are not worth storing.
export function cleanParams(params: Record<string, unknown>): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue
    out[key] = String(value)
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function formatHistory(history: HistoryItem[]): string {
  if (history.length === 0) return "Ø"
  return history
    .map(({ id, created_at, status, steps }) => {
      const [date, time] = created_at.split(" ")
      let msg = `date=${date} time=${time} id=${id} status=${status}`
      let list: { name: string; done?: boolean }[] = []
      try {
        const parsed = JSON.parse(steps)
        if (Array.isArray(parsed)) list = parsed
      } catch {
        list = []
      }
      if (list.length > 0) {
        const out = list.map(({ name, done = false }, i) => {
          const label = name.split("/")[1] || "na"
          if (status === "FAILURE" && !done) return label + "[✗]"
          if (status === "RUNNING" && !done && (list[i - 1] ? list[i - 1].done : true)) return label + "[○]"
          if (["RUNNING", "PENDING"].includes(status) && done) return label + "[✓]"
          if (["READY", "CLAIMED"].includes(status)) return label + "[○]"
          return label
        })
        msg += "[" + out.join(" ➜ ") + "]"
      }
      return msg
    })
    .join("\n")
}

// Old links carried the whole workflow as base64 JSON in `?specs=`.
export function decodeLegacySpecs(b64: string): Partial<Workflow> | null {
  try {
    const bin = atob(b64.replace(/ /g, "+").replace(/-/g, "+").replace(/_/g, "/"))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
    return typeof json === "object" && json !== null && !Array.isArray(json) ? json : null
  } catch {
    return null
  }
}

// The create dialog hands its choice to the editor through here; it is read once.
let pending: Partial<Workflow> | null = null

export function setPendingNew(w: Partial<Workflow>) {
  pending = w
}

export function takePendingNew(): Partial<Workflow> | null {
  const w = pending
  pending = null
  return w
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : Intl.DateTimeFormat(navigator.language).format(d)
}
