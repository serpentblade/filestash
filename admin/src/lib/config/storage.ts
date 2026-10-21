import type { Connection } from "$lib/types"

export type { Connection } from "$lib/types"

export type Mode = "own" | "signin"

export type StorageEntry = {
  key: string // stable id: "c<index>" for loaded connections, "new-<n>" for new ones
  original: Connection | null
  type: string
  label: string
  mode: Mode
  details: Record<string, string>
}

export type Middleware = {
  identity_provider: { type: string | null; params: string }
  attribute_mapping: { related_backend: string; params: string }
}

// Settings from the loaded config that don't belong to any storage in sign-in
// mode. paramValues holds the raw params entries so they can be carried as-is.
export type Leftovers = { relatedLabels: string[]; paramKeys: string[]; paramValues: Record<string, unknown> }

export type StorageState = {
  entries: StorageEntry[]
  method: string | null
  methodParams: Record<string, string>
  leftovers: Leftovers
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

export function parseJSONObject(s: unknown): Record<string, any> {
  if (typeof s !== "string" || s === "") return {}
  try {
    const v = JSON.parse(s)
    return isObject(v) ? v : {}
  } catch {
    return {}
  }
}

export function splitRelated(s: string): string[] {
  if (typeof s !== "string") return []
  return s
    .split(",")
    .map((l) => l.trim())
    .filter((l) => l !== "")
}

const toStrings = (o: Record<string, unknown>): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined) continue
    out[k] = typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v)
  }
  return out
}

const normMethod = (m: unknown): string | null => (typeof m === "string" && m !== "" ? m : null)

const emptyLeftovers = (): Leftovers => ({ relatedLabels: [], paramKeys: [], paramValues: {} })

let counter = 0
export function newKey(): string {
  counter += 1
  return `new-${counter}`
}

export function loadStorage(connections: Connection[], mw: Middleware): StorageState {
  const method = normMethod(mw?.identity_provider?.type)
  const methodParams = toStrings(parseJSONObject(mw?.identity_provider?.params))
  const related = splitRelated(mw?.attribute_mapping?.related_backend)
  const params = parseJSONObject(mw?.attribute_mapping?.params)
  const labels = new Set(connections.map((c) => c.label))

  const entries = connections.map((c, i): StorageEntry => {
    const signin = method !== null && related.includes(c.label)
    const raw = signin && isObject(params[c.label]) ? (params[c.label] as Record<string, unknown>) : {}
    const { type: _type, ...details } = raw
    return {
      key: `c${i}`,
      original: structuredClone(c),
      type: c.type,
      label: c.label,
      mode: signin ? "signin" : "own",
      details: toStrings(details),
    }
  })

  const leftovers = emptyLeftovers()
  leftovers.relatedLabels = related.filter((l) => method === null || !labels.has(l))
  leftovers.paramKeys = Object.keys(params).filter((k) => method === null || !labels.has(k))
  for (const k of leftovers.paramKeys) leftovers.paramValues[k] = structuredClone(params[k])

  return { entries, method, methodParams, leftovers }
}

export function saveStorage(
  state: StorageState,
  opts: { removeLeftovers?: boolean } = {},
): { connections: Connection[]; middleware: Middleware } {
  const method = normMethod(state.method)
  const connections = state.entries.map((e): Connection => ({
    ...(e.original ? structuredClone(e.original) : {}),
    type: e.type,
    label: e.label,
  }))

  const related: string[] = []
  const params: Record<string, unknown> = {}
  if (method !== null) {
    for (const e of state.entries) {
      if (e.mode !== "signin") continue
      related.push(e.label)
      params[e.label] = { type: e.type, ...e.details }
    }
    if (!opts.removeLeftovers) {
      // A leftover named like a current storage is never carried: that
      // storage's own mode decides whether its label and params are saved.
      const taken = new Set(state.entries.map((e) => e.label))
      for (const l of state.leftovers.relatedLabels) {
        if (!taken.has(l)) related.push(l)
      }
      for (const k of state.leftovers.paramKeys) {
        if (!taken.has(k)) params[k] = structuredClone(state.leftovers.paramValues[k])
      }
    }
  }

  return {
    connections,
    middleware: {
      identity_provider: { type: method ?? "", params: JSON.stringify(state.methodParams) },
      attribute_mapping: { related_backend: related.join(", "), params: JSON.stringify(params) },
    },
  }
}

export function validateLabel(label: string, others: string[]): string | null {
  const l = label.trim()
  if (l === "") return "Name is required"
  if (l.includes(",")) return "Name can't contain a comma"
  if (others.some((o) => o.trim() === l)) return "Another storage already has this name"
  return null
}

export function duplicateLabels(entries: StorageEntry[]): Set<string> {
  const seen = new Set<string>()
  const dups = new Set<string>()
  for (const e of entries) {
    if (seen.has(e.label)) dups.add(e.label)
    seen.add(e.label)
  }
  return dups
}

export function nextLabel(type: string, entries: StorageEntry[]): string {
  const taken = new Set(entries.map((e) => e.label))
  if (!taken.has(type)) return type
  let n = 2
  while (taken.has(`${type} ${n}`)) n += 1
  return `${type} ${n}`
}

export function usesSignIn(state: StorageState): StorageEntry[] {
  return state.method === null ? [] : state.entries.filter((e) => e.mode === "signin")
}

export function setMethod(state: StorageState, method: string | null, params: Record<string, string>): StorageState {
  const m = normMethod(method)
  return {
    ...state,
    method: m,
    methodParams: { ...params },
    entries: m === null ? state.entries.map((e) => ({ ...e, mode: "own", details: {} })) : state.entries,
  }
}
