import type { FormElement, Schema } from "$lib/types"

export type { FormElement, Schema } from "$lib/types"

type Values = Record<string, unknown>

const isObject = (node: unknown): node is Record<string, unknown> =>
  typeof node === "object" && node !== null && !Array.isArray(node)

export function isLeaf(node: unknown): node is FormElement {
  return isObject(node) && "label" in node && "type" in node && "default" in node && "value" in node
}

export function toValues(schema: Schema): Values {
  const out: Values = {}
  for (const [key, node] of Object.entries(schema)) {
    out[key] = isLeaf(node) ? node.value : toValues(node)
  }
  return out
}

export function withValues(schema: Schema, values: Values): Schema {
  const out: Schema = {}
  for (const [key, node] of Object.entries(schema)) {
    const has = isObject(values) && key in values
    if (isLeaf(node)) {
      out[key] = { ...node, value: has ? values[key] : node.value }
    } else {
      const sub = has && isObject(values[key]) ? (values[key] as Values) : {}
      out[key] = withValues(node, sub)
    }
  }
  return out
}

export function coerce(el: FormElement, raw: string | boolean | null): unknown {
  if (el.type === "number") {
    return raw === "" || raw === null ? null : Number(raw)
  }
  if (el.type === "boolean") return Boolean(raw)
  return raw === "" ? null : raw
}

export function omit(values: Values, keys: string[]): Values {
  return Object.fromEntries(Object.entries(values).filter(([k]) => !keys.includes(k)))
}

export function pick(values: Values, keys: string[]): Values {
  return Object.fromEntries(Object.entries(values).filter(([k]) => keys.includes(k)))
}
