import { describe, expect, it } from "vitest"
import { coerce, isLeaf, omit, pick, toValues, withValues } from "./schema"
import type { FormElement, Schema } from "./schema"

const leaf = (label: string, type: string, value: unknown, def: unknown = null): FormElement => ({
  label,
  type,
  readonly: false,
  default: def,
  value,
  required: false,
})

describe("schema helpers", () => {
  it("toValues flattens nested leaves", () => {
    const s: Schema = {
      general: { name: leaf("name", "text", null, "Filestash") },
      features: { api: { enable: leaf("enable", "boolean", true, false) } },
    }
    expect(toValues(s)).toEqual({ general: { name: null }, features: { api: { enable: true } } })
  })

  it("withValues round-trips", () => {
    const s: Schema = {
      general: { name: leaf("name", "text", null), port: leaf("port", "number", 1) },
      auth: { x: { y: leaf("y", "text", "a") } },
    }
    const v = { general: { name: "n", port: 8334 }, auth: { x: { y: "b" } } }
    expect(toValues(withValues(s, v))).toEqual(v)
    expect((s.general as Schema).name).toMatchObject({ value: null })
  })

  it("withValues keeps schema value for missing paths", () => {
    const s: Schema = { a: leaf("a", "text", "keep") }
    expect(toValues(withValues(s, {}))).toEqual({ a: "keep" })
  })

  it("coerce number keeps decimals and maps empty to null", () => {
    const numEl = leaf("n", "number", null)
    expect(coerce(numEl, "1.5")).toBe(1.5)
    expect(coerce(numEl, "")).toBeNull()
    expect(coerce(numEl, null)).toBeNull()
  })

  it("coerce number maps whitespace and non-numeric to null", () => {
    const numEl = leaf("n", "number", null)
    expect(coerce(numEl, " ")).toBeNull()
    expect(coerce(numEl, "abc")).toBeNull()
    expect(coerce(numEl, " 2 ")).toBe(2)
  })

  it("withValues and toValues do not alias arrays", () => {
    const el = { ...leaf("l", "select", ["a"], ["d"]), options: ["x", "y"] }
    const s: Schema = { g: { l: el } }
    const kept = withValues(s, {}).g as Schema
    ;(kept.l as FormElement).options!.push("z")
    ;((kept.l as FormElement).value as string[]).push("z")
    ;((kept.l as FormElement).default as string[]).push("z")
    expect(el.options).toEqual(["x", "y"])
    expect(el.value).toEqual(["a"])
    expect(el.default).toEqual(["d"])

    const supplied = { g: { l: ["q"] } }
    const set = withValues(s, supplied).g as Schema
    ;((set.l as FormElement).value as string[]).push("z")
    expect(supplied.g.l).toEqual(["q"])

    const out = toValues(s) as { g: { l: string[] } }
    out.g.l.push("z")
    expect(el.value).toEqual(["a"])
  })

  it("coerce handles boolean and text", () => {
    expect(coerce(leaf("b", "boolean", false), true)).toBe(true)
    expect(coerce(leaf("t", "text", null), "")).toBeNull()
    expect(coerce(leaf("t", "text", null), "hi")).toBe("hi")
  })

  it("isLeaf ignores section objects that happen to have a \"type\" key", () => {
    expect(isLeaf({ type: leaf("type", "hidden", "x") })).toBe(false)
    expect(isLeaf(leaf("a", "text", null))).toBe(true)
    expect(isLeaf(null)).toBe(false)
  })

  it("omit and pick", () => {
    expect(omit({ a: 1, b: 2 }, ["a"])).toEqual({ b: 2 })
    expect(pick({ a: 1, b: 2 }, ["a", "z"])).toEqual({ a: 1 })
  })
})
