import { isLeaf } from "$lib/config/schema"
import { usesSignIn, type StorageState } from "$lib/config/storage"
import type { Schema } from "$lib/types"
import { t, methodName } from "$lib/i18n"

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
  for (const text of all) {
    for (const m of text.matchAll(/\{\{\s*\.(\w+)\s*\}\}/g)) {
      const token = `{{ .${m[1]} }}`
      if (!found.includes(token)) found.push(token)
    }
  }
  return found.length > 0 ? found : [...FALLBACK]
}

export function methodChangeWarning(state: StorageState, next: string | null): string | null {
  if (next === state.method) return null
  const local = state.method === "local" ? t("The local user list will be cleared.") : null
  const using = usesSignIn(state)
  if (using.length === 0) return local
  const labels = using.map((e) => e.label.trim()).join(", ")
  const base =
    next === null
      ? t("{{LABELS}} will switch to users entering their own login, and their stored connection details will be removed.", { LABELS: labels })
      : t("{{LABELS}} will now sign in with {{METHOD}}.", { LABELS: labels, METHOD: methodName(next) })
  return local ? `${base} ${local}` : base
}
