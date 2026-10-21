import { describe, expect, it } from "vitest"
import { createDraft } from "./draft.svelte"

describe("draft", () => {
  it("dirty tracks edits and reset", () => {
    const d = createDraft({ a: 1 })
    expect(d.dirty).toBe(false)
    d.value.a = 2
    expect(d.dirty).toBe(true)
    d.reset()
    expect(d.dirty).toBe(false)
    expect(d.value.a).toBe(1)
    d.dispose()
  })

  it("save failure keeps edits", async () => {
    const d = createDraft({ a: 1 })
    d.value.a = 2
    const ok = await d.save(() => Promise.reject(new Error("nope")))
    expect(ok).toBe(false)
    expect(d.dirty).toBe(true)
    expect(d.value.a).toBe(2)
    d.dispose()
  })

  it("save success resets the baseline and adopts a returned value", async () => {
    const d = createDraft({ a: 1 })
    d.value.a = 2
    expect(await d.save(async (v) => ({ a: v.a + 1 }))).toBe(true)
    expect(d.dirty).toBe(false)
    expect(d.value.a).toBe(3)
    d.value.a = 5
    expect(await d.save(async () => {})).toBe(true)
    expect(d.dirty).toBe(false)
    expect(d.value.a).toBe(5)
    d.dispose()
  })
})
