import { describe, expect, it } from "vitest"
import { cleanParams, decodeLegacySpecs, formatHistory, newWorkflowId, setPendingNew, takePendingNew } from "./model"

describe("workflow model", () => {
  it("cleanParams drops empty values", () => {
    expect(cleanParams({ a: "x", b: "" })).toEqual({ a: "x" })
    expect(cleanParams({ b: "" })).toBeUndefined()
    expect(cleanParams({ a: null, b: undefined })).toBeUndefined()
  })

  it("cleanParams stringifies non-string values", () => {
    expect(cleanParams({ n: 3, t: true })).toEqual({ n: "3", t: "true" })
  })

  it("formatHistory matches legacy format", () => {
    const steps = JSON.stringify([{ name: "notify/email", done: true }, { name: "tools/debug", done: false }])
    expect(formatHistory([{ id: 1, created_at: "2026-10-20 10:00:00", status: "FAILURE", steps }])).toBe(
      "date=2026-10-20 time=10:00:00 id=1 status=FAILURE[email ➜ debug[✗]]",
    )
  })

  it("formatHistory marks running and ready steps", () => {
    const steps = JSON.stringify([{ name: "a/b", done: true }, { name: "c/d", done: false }])
    expect(formatHistory([{ id: 2, created_at: "d t", status: "RUNNING", steps }])).toContain("[b[✓] ➜ d[○]]")
    expect(formatHistory([{ id: 2, created_at: "d t", status: "READY", steps }])).toContain("[b[○] ➜ d[○]]")
  })

  it("formatHistory tolerates unparsable steps", () => {
    expect(formatHistory([{ id: 3, created_at: "d t", status: "OK", steps: "nope" }])).toBe("date=d time=t id=3 status=OK")
  })

  it("formatHistory empty is Ø", () => {
    expect(formatHistory([])).toBe("Ø")
  })

  it("decodeLegacySpecs handles bad input", () => {
    expect(decodeLegacySpecs("%%%")).toBeNull()
    expect(decodeLegacySpecs(btoa("[1]"))).toBeNull()
  })

  it("decodeLegacySpecs decodes a legacy link", () => {
    const w = { name: "n", published: false, trigger: { name: "schedule" }, actions: [{ name: "tools/debug" }] }
    expect(decodeLegacySpecs(btoa(JSON.stringify(w)))).toEqual(w)
  })

  it("newWorkflowId is unique and non-empty", () => {
    expect(newWorkflowId()).toMatch(/^[0-9a-z]{5,}$/)
    expect(newWorkflowId()).not.toBe(newWorkflowId())
  })

  it("pending workflow is handed over once", () => {
    const w = { name: "n", published: false, trigger: { name: "event" }, actions: [{ name: "tools/debug" }] }
    setPendingNew(w)
    expect(takePendingNew()).toEqual(w)
    expect(takePendingNew()).toBeNull()
  })
})
