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
import SettingsPage from "./SettingsPage.svelte"

const el = (type: string, label: string, extra: Record<string, unknown> = {}) => ({
  label, type, default: null, value: null, readonly: false, required: false, ...extra,
})

const config = (hash = "$2a$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") => ({
  general: { name: el("text", "name", { value: "Filestash" }) },
  auth: { admin: el("bcrypt", "admin", { value: hash }) },
  log: { level: el("text", "level", { value: "INFO" }) },
  middleware: {
    identity_provider: { type: el("hidden", "type", { value: "htpasswd" }) },
  },
  constant: { user: el("text", "user", { value: "x" }) },
})

const posted = () => vi.mocked(api.postConfig).mock.calls[0][0] as Record<string, any>

describe("settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getPublicConfig).mockResolvedValue({ connections: [{ type: "s3", label: "a" }], auth: [] })
    vi.mocked(api.postConfig).mockResolvedValue(undefined)
  })
  afterEach(() => {
    cleanup()
    confirmState.current = null
  })

  it("save sends only owned keys and preserves middleware", async () => {
    vi.mocked(api.getAdminConfig).mockResolvedValue(config() as never)
    render(SettingsPage)
    const name = await screen.findByLabelText("name")
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
    const name = await screen.findByLabelText("name")
    // someone else changed the password after this page loaded
    admin.mockResolvedValue(config("$2a$10$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") as never)
    await fireEvent.input(name, { target: { value: "Renamed" } })
    await fireEvent.click(await screen.findByRole("button", { name: "Save" }))
    await waitFor(() => expect(api.postConfig).toHaveBeenCalled())
    expect(posted().auth.admin).toBe("$2a$10$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
  })
})
