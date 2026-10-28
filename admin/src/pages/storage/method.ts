import { isLeaf } from "$lib/config/schema"
import { usesSignIn, type StorageState } from "$lib/config/storage"
import type { Schema } from "$lib/types"

const FALLBACK = ["{{ .user }}", "{{ .password }}"]

function texts(node: unknown, out: string[]) {
  if (typeof node !== "object" || node === null) return
  if (isLeaf(node)) {
    if (node.description) out.push(node.description)
    if (node.placeholder) out.push(node.placeholder)
    return
  }
  for (const child of Object.values(node)) texts(child, out)
}

// the {{ .name }} tokens a login method documents for the connection details
export function methodVariables(spec: Schema | undefined): string[] {
  const found: string[] = []
  const all: string[] = []
  if (spec) texts(spec, all)
  for (const t of all) {
    for (const m of t.matchAll(/\{\{\s*\.(\w+)\s*\}\}/g)) {
      const token = `{{ .${m[1]} }}`
      if (!found.includes(token)) found.push(token)
    }
  }
  return found.length > 0 ? found : [...FALLBACK]
}

const LOCAL_CLEARED = "The local user list will be cleared."

export function methodChangeWarning(state: StorageState, next: string | null): string | null {
  if (next === state.method) return null
  const local = state.method === "local" ? LOCAL_CLEARED : null
  const using = usesSignIn(state)
  if (using.length === 0) return local
  const labels = using.map((e) => e.label.trim()).join(", ")
  const base =
    next === null
      ? `${labels} will switch to users entering their own login, and their stored connection details will be removed.`
      : `${labels} will now sign in with ${next}.`
  return local ? `${base} ${local}` : base
}
