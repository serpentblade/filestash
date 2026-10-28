// Splits the settings schema into the sections listed down the left of the page.
//
// A top-level object with fields of its own (general, email, auth) is one section.
// A top-level object made only of sub-objects (features) is a group heading, and
// each sub-object is a section under it. Sections with fields come first, in the
// server's order, then the groups.

import { isLeaf } from "$lib/config/schema"
import type { FormElement, Schema } from "$lib/types"

export type Section = {
  slug: string
  path: string[]
  group: string | null
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

export function settingsSections(schema: Schema): Section[] {
  const own: Section[] = []
  const grouped: Section[] = []
  for (const [key, node] of Object.entries(schema)) {
    if (isLeaf(node) || !isObj(node)) continue
    const children = Object.entries(node)
    const hasFields = children.some(([, n]) => isLeaf(n))
    if (hasFields || children.length === 0) {
      own.push({ slug: key, path: [key], group: null })
      continue
    }
    for (const [sub, n] of children) {
      if (!isLeaf(n) && isObj(n)) grouped.push({ slug: sub, path: [key, sub], group: key })
    }
  }
  const all = [...own, ...grouped]
  // a sub-section named like another section gets its group in front: features-auth
  const count = new Map<string, number>()
  for (const s of all) count.set(s.slug, (count.get(s.slug) ?? 0) + 1)
  return all.map((s) => (count.get(s.slug)! > 1 && s.group ? { ...s, slug: `${s.group}-${s.slug}` } : s))
}

export function at(root: unknown, path: string[]): unknown {
  let cur = root
  for (const k of path) cur = isObj(cur) ? cur[k] : undefined
  return cur
}

// A section's on/off switch: a field named "enable", else the first "enable" type field.
// null when the section has none.
export function enabled(node: unknown, values: unknown): boolean | null {
  if (!isObj(node)) return null
  const entries = Object.entries(node).filter(([, n]) => isLeaf(n)) as [string, FormElement][]
  const sw =
    entries.find(([k, n]) => k === "enable" && (n.type === "boolean" || n.type === "enable")) ??
    entries.find(([, n]) => n.type === "enable")
  if (!sw) return null
  const v = isObj(values) ? values[sw[0]] : undefined
  const on = v === null || v === undefined ? sw[1].default : v
  return on === true || on === "true"
}
