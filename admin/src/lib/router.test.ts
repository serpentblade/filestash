import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { get } from "svelte/store"
import { addGuard, href, navigate, parseRoute, route, safeNext } from "./router"

const BASE = "http://h/files/"

describe("parseRoute", () => {
  it("parses under sub-path base", () => {
    expect(parseRoute("/files/admin/storage", "", BASE)?.name).toBe("storage")
  })

  it("parses the fixed pages", () => {
    const names = ["workflow", "activity", "settings", "about", "setup"]
    const want = ["workflow-list", "activity", "settings", "about", "setup"]
    names.forEach((n, i) => expect(parseRoute(`/admin/${n}`, "", "http://h/")?.name).toBe(want[i]))
    expect(parseRoute("/admin", "", "http://h/")?.name).toBe("home")
    expect(parseRoute("/admin/", "", "http://h/")?.name).toBe("home")
    expect(parseRoute("/admin/workflow/new", "", "http://h/")?.name).toBe("workflow-new")
  })

  it("parses workflow id", () => {
    const r = parseRoute("/admin/workflow/abc", "", "http://h/")
    expect(r?.name).toBe("workflow-edit")
    expect(r?.params.id).toBe("abc")
  })

  it("legacy specs link opens", () => {
    const b64 = btoa(JSON.stringify({ id: "x", name: "n" }))
    const r = parseRoute("/admin/workflow", "?specs=" + b64, "http://h/")
    expect(r?.name).toBe("workflow-edit")
    expect(r?.params.id).toBe("x")
    expect(r?.params.specs).toBe(b64)
  })

  it("legacy specs without id is workflow-new", () => {
    const b64 = btoa(JSON.stringify({ name: "n" }))
    const r = parseRoute("/admin/workflow", "?specs=" + b64, "http://h/")
    expect(r?.name).toBe("workflow-new")
    expect(r?.params.specs).toBe(b64)
  })

  it("invalid specs fall back to workflow-list", () => {
    expect(parseRoute("/admin/workflow", "?specs=%%%", "http://h/")?.name).toBe("workflow-list")
    expect(parseRoute("/admin/workflow", "?specs=" + btoa("not json"), "http://h/")?.name).toBe(
      "workflow-list",
    )
  })

  it("unknown path returns null", () => {
    expect(parseRoute("/nope", "", "http://h/")).toBeNull()
    expect(parseRoute("/admin/zzz", "", "http://h/")).toBeNull()
    expect(parseRoute("/other/admin/storage", "", BASE)).toBeNull()
  })
})

describe("href", () => {
  it("is resolved under the document base", () => {
    const el = document.createElement("base")
    el.href = BASE
    document.head.appendChild(el)
    expect(href("admin/storage")).toBe("/files/admin/storage")
    el.remove()
  })
})

describe("safeNext", () => {
  it("rejects other origins", () => {
    expect(safeNext("https://evil/x", "http://h")).toBeNull()
    expect(safeNext("//evil/x", "http://h")).toBeNull()
    expect(safeNext(null, "http://h")).toBeNull()
  })
  it("keeps same-origin paths", () => {
    expect(safeNext("/admin/settings", "http://h")).toBe("/admin/settings")
  })
})

describe("navigate", () => {
  let off: (() => void) | undefined
  let baseEl: HTMLBaseElement
  beforeEach(() => {
    baseEl = document.createElement("base")
    baseEl.href = location.origin + "/"
    document.head.appendChild(baseEl)
    history.replaceState(null, "", "/admin/about")
  })
  afterEach(() => {
    off?.()
    baseEl.remove()
  })

  it("is cancelled by a dirty guard whose confirm returns false", async () => {
    const confirm = vi.fn().mockResolvedValue(false)
    off = addGuard({ isDirty: () => true, confirm })
    expect(await navigate("admin/settings")).toBe(false)
    expect(confirm).toHaveBeenCalled()
    expect(location.pathname).toBe("/admin/about")
  })

  it("proceeds when the guard is clean", async () => {
    const confirm = vi.fn()
    off = addGuard({ isDirty: () => false, confirm })
    expect(await navigate("admin/settings")).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
    expect(location.pathname).toBe("/admin/settings")
    expect(get(route)?.name).toBe("settings")
  })

  it("proceeds when a dirty guard confirms, and unregisters", async () => {
    off = addGuard({ isDirty: () => true, confirm: async () => true })
    expect(await navigate("admin/activity", { replace: true })).toBe(true)
    off()
    const confirm = vi.fn().mockResolvedValue(false)
    off = addGuard({ isDirty: () => false, confirm })
    expect(await navigate("admin/about")).toBe(true)
  })

  it("beforeunload is prevented when dirty", () => {
    off = addGuard({ isDirty: () => true, confirm: async () => true })
    const e = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })

  it("intercepts clicks on a[data-link]", async () => {
    const a = document.createElement("a")
    a.setAttribute("data-link", "")
    a.href = "/admin/storage"
    document.body.appendChild(a)
    a.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(location.pathname).toBe("/admin/storage")
    a.remove()
  })
})
