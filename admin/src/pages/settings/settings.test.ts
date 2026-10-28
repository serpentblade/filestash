import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte"

vi.mock("$lib/api/endpoints", () => ({
  getAdminConfig: vi.fn(),
  getPublicConfig: vi.fn(),
  postConfig: vi.fn(),
  getSession: vi.fn(async () => true),
  login: vi.fn(),
}))
vi.mock("svelte-sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

import * as api from "$lib/api/endpoints"
import { confirmState } from "$lib/confirm.svelte"
import { navigate } from "$lib/router"
import SettingsPage from "./SettingsPage.svelte"

const el = (type: string, label: string, extra: Record<string, unknown> = {}) => ({
  label, type, default: null, value: null, readonly: false, required: false, ...extra,
})

const config = (hash = "$2a$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") => ({
  general: { name: el("text", "name", { value: "Filestash" }) },
  features: {
    share: { enable: el("boolean", "enable", { default: true }), redirect: el("text", "redirect") },
    search: { explore_timeout: el("number", "explore_timeout") },
  },
  email: { server: el("text", "server") },
  auth: { admin: el("bcrypt", "admin", { value: hash }) },
  log: { level: el("text", "level", { value: "INFO" }) },
  middleware: {
    identity_provider: { type: el("hidden", "type", { value: "htpasswd" }) },
  },
  constant: { user: el("text", "user", { value: "x" }) },
})

const posted = () => vi.mocked(api.postConfig).mock.calls[0][0] as Record<string, any>

describe("settings page", () => {
  let baseEl: HTMLBaseElement
  beforeEach(async () => {
    baseEl = document.createElement("base")
    baseEl.href = location.origin + "/"
    document.head.appendChild(baseEl)
    history.replaceState(null, "", "/admin/settings")
    await navigate("admin/settings", { replace: true })
    vi.clearAllMocks()
    vi.mocked(api.getPublicConfig).mockResolvedValue({ connections: [{ type: "s3", label: "a" }], auth: [] })
    vi.mocked(api.postConfig).mockResolvedValue(undefined)
  })
  afterEach(() => {
    cleanup()
    baseEl.remove()
    confirmState.current = null
  })

  it("save sends only owned keys and preserves middleware", async () => {
    vi.mocked(api.getAdminConfig).mockResolvedValue(config() as never)
    render(SettingsPage)
    const name = await screen.findByLabelText("Name")
    await fireEvent.input(name, { target: { value: "Renamed" } })
    await fireEvent.click(await screen.findByRole("button", { name: "Save" }))
    await waitFor(() => expect(api.postConfig).toHaveBeenCalled())
    const body = posted()
    expect(body.general.name).toBe("Renamed")
    expect(body.middleware.identity_provider.type).toBe("htpasswd")
    expect(body.log.level).toBe("INFO")
    expect(body.connections).toEqual([{ type: "s3", label: "a" }])
    expect(body.constant).toBeUndefined()
  })

  it("keeps the server's admin hash when the field was not edited", async () => {
    const admin = vi.mocked(api.getAdminConfig)
    admin.mockResolvedValueOnce(config() as never)
    render(SettingsPage)
    const name = await screen.findByLabelText("Name")
    // someone else changed the password after this page loaded
    admin.mockResolvedValue(config("$2a$10$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") as never)
    await fireEvent.input(name, { target: { value: "Renamed" } })
    await fireEvent.click(await screen.findByRole("button", { name: "Save" }))
    await waitFor(() => expect(api.postConfig).toHaveBeenCalled())
    expect(posted().auth.admin).toBe("$2a$10$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
  })

  it("lists the sections and shows only the first", async () => {
    vi.mocked(api.getAdminConfig).mockResolvedValue(config() as never)
    render(SettingsPage)
    const nav = await screen.findByRole("navigation", { name: "Settings sections" })
    const links = [...nav.querySelectorAll("a")].map((a) => a.querySelector("span")?.textContent)
    expect(links).toEqual(["General", "Email", "Admin password", "Share", "Search"])
    expect(await screen.findByLabelText("Name")).toBeTruthy()
    expect(screen.queryByLabelText("Server")).toBeNull()
    expect(nav.querySelector('a[href="/admin/settings/share"]')?.textContent).toContain("On")
    expect(nav.querySelector('a[href="/admin/settings/search"]')?.textContent).not.toMatch(/On|Off/)
  })

  it("opens the section in the address", async () => {
    await navigate("admin/settings/share", { replace: true })
    vi.mocked(api.getAdminConfig).mockResolvedValue(config() as never)
    render(SettingsPage)
    expect(await screen.findByLabelText("Redirect")).toBeTruthy()
    expect(screen.queryByLabelText("Name")).toBeNull()
  })

  it("falls back to the first section for an unknown one", async () => {
    await navigate("admin/settings/nope", { replace: true })
    vi.mocked(api.getAdminConfig).mockResolvedValue(config() as never)
    render(SettingsPage)
    expect(await screen.findByLabelText("Name")).toBeTruthy()
    await waitFor(() => expect(location.pathname).toBe("/admin/settings"))
  })

  it("keeps edits across sections without asking, marks them, and saves them together", async () => {
    vi.mocked(api.getAdminConfig).mockResolvedValue(config() as never)
    render(SettingsPage)
    await fireEvent.input(await screen.findByLabelText("Name"), { target: { value: "Renamed" } })
    const nav = await screen.findByRole("navigation", { name: "Settings sections" })
    const general = nav.querySelector('a[href="/admin/settings"]')!
    await waitFor(() => expect(general.textContent).toContain("Unsaved changes"))
    await fireEvent.click(nav.querySelector('a[href="/admin/settings/email"]')!)
    const server = await screen.findByLabelText("Server")
    expect(confirmState.current).toBeNull()
    await fireEvent.input(server, { target: { value: "smtp.example.com" } })
    await fireEvent.click(await screen.findByRole("button", { name: "Save" }))
    await waitFor(() => expect(api.postConfig).toHaveBeenCalled())
    expect(posted().general.name).toBe("Renamed")
    expect(posted().email.server).toBe("smtp.example.com")
  })
})
