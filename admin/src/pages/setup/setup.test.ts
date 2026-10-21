import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte"

vi.mock("$lib/api/endpoints", () => ({
  getAdminConfig: vi.fn(),
  getPublicConfig: vi.fn(),
  getBackends: vi.fn(),
  getAuthMiddlewares: vi.fn(),
  postConfig: vi.fn(),
  getSession: vi.fn(async () => true),
  login: vi.fn(),
  getRelease: vi.fn(),
}))
vi.mock("svelte-sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock("$lib/redirect", () => ({ redirect: vi.fn() }))

import * as api from "$lib/api/endpoints"
import { toast } from "svelte-sonner"
import { redirect } from "$lib/redirect"
import { confirmState, settle } from "$lib/confirm.svelte"
import { session } from "$lib/session.svelte"
import { route } from "$lib/router"
import ConfirmDialog from "$lib/components/ConfirmDialog.svelte"
import SetupPage from "./SetupPage.svelte"
import AboutPage from "../about/AboutPage.svelte"

const el = (type: string, label: string, extra: Record<string, unknown> = {}) => ({
  label, type, default: null, value: null, readonly: false, required: false, ...extra,
})

const config = (admin = "", telemetry = true) => ({
  auth: { admin: el("bcrypt", "admin", { value: admin }) },
  log: { telemetry: el("boolean", "telemetry", { value: telemetry }) },
  middleware: {
    identity_provider: { type: el("hidden", "type", { value: "" }), params: el("hidden", "params", { value: "" }) },
    attribute_mapping: { related_backend: el("hidden", "rb", { value: "" }), params: el("hidden", "params", { value: "" }) },
  },
  constant: { user: el("text", "user", { value: "bob" }), license: el("text", "license", { value: "agpl" }) },
})

const setRoute = (query = "") =>
  route.set({ name: "setup", params: {}, query: new URLSearchParams(query) })
const posted = () => vi.mocked(api.postConfig).mock.calls.at(-1)![0] as Record<string, any>

describe("setup page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.isAdmin = true
    setRoute()
    vi.mocked(api.getAdminConfig).mockImplementation(async () => config("") as never)
    vi.mocked(api.getPublicConfig).mockResolvedValue({ connections: [], auth: [] })
    vi.mocked(api.getBackends).mockResolvedValue({ s3: {}, local: {}, sftp: {} } as never)
    vi.mocked(api.getAuthMiddlewares).mockResolvedValue({ passthrough: {}, local: {} } as never)
    vi.mocked(api.postConfig).mockResolvedValue(undefined)
    vi.mocked(api.login).mockResolvedValue(undefined)
  })
  afterEach(() => {
    cleanup()
    confirmState.current = null
  })

  it("redirects to the admin login when not an admin", async () => {
    session.isAdmin = false
    render(SetupPage)
    await waitFor(() => expect(redirect).toHaveBeenCalledWith(expect.stringContaining("admin/")))
  })

  it("shows loading while the session is unknown", () => {
    session.isAdmin = null
    render(SetupPage)
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy()
    expect(api.getAdminConfig).not.toHaveBeenCalled()
  })

  it("starts at step 2 when an admin password already exists", async () => {
    vi.mocked(api.getAdminConfig).mockImplementation(async () => config("$2a$hash") as never)
    render(SetupPage)
    expect(await screen.findByText("You're at the Helm now")).toBeTruthy()
  })

  it("?step=1 wins over an existing password", async () => {
    vi.mocked(api.getAdminConfig).mockImplementation(async () => config("$2a$hash") as never)
    setRoute("step=1")
    render(SetupPage)
    expect(await screen.findByText("Welcome Aboard!")).toBeTruthy()
  })

  it("step 1 hashes the password, saves it, logs in and moves to step 2", async () => {
    render(SetupPage)
    await fireEvent.input(await screen.findByPlaceholderText("Password"), { target: { value: "secret" } })
    await fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    expect(await screen.findByText("You're at the Helm now")).toBeTruthy()
    const hash = posted().auth.admin as string
    expect(hash).toMatch(/^\$2[aby]\$/)
    expect(hash).not.toContain("secret")
    expect(api.login).toHaveBeenCalledWith("secret")
    expect(posted().constant).toBeUndefined()
  })

  async function step2(connections: unknown[] = []) {
    vi.mocked(api.getAdminConfig).mockImplementation(async () => config("$2a$hash") as never)
    vi.mocked(api.getPublicConfig).mockResolvedValue({ connections, auth: [] } as never)
    render(SetupPage)
    render(ConfirmDialog)
    await screen.findByText("You're at the Helm now")
    await screen.findAllByRole("button", { name: "Apply preset" })
  }

  const presetButton = (i: number) => screen.getAllByRole("button", { name: "Apply preset" })[i]

  it("applies the S3 preset: replaces connections and identity provider, toasts success", async () => {
    await step2()
    await fireEvent.click(presetButton(3))
    await waitFor(() => expect(api.postConfig).toHaveBeenCalled())
    const body = posted()
    expect(body.connections).toEqual([{ type: "s3", label: "s3" }])
    expect(body.middleware.identity_provider).toEqual({ type: "passthrough", params: "{\"strategy\":\"username_and_password\"}" })
    expect(body.middleware.attribute_mapping.related_backend).toBe("s3")
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
  })

  it("asks for inputs before applying a preset that needs them", async () => {
    await step2()
    await fireEvent.click(presetButton(2))
    await fireEvent.input(await screen.findByLabelText("sftp_hostname"), { target: { value: "host" } })
    await fireEvent.click(screen.getByRole("button", { name: "Apply" }))
    await waitFor(() => expect(api.postConfig).toHaveBeenCalled())
    expect(JSON.parse(posted().middleware.attribute_mapping.params).sftp.hostname).toBe("host")
  })

  it("confirms first and lists the storages being replaced", async () => {
    await step2([{ type: "s3", label: "mine" }, { type: "ftp", label: "other" }])
    await fireEvent.click(presetButton(3))
    await waitFor(() => expect(confirmState.current).not.toBeNull())
    expect(confirmState.current!.body).toContain("mine")
    expect(confirmState.current!.body).toContain("other")
    expect(api.postConfig).not.toHaveBeenCalled()
    settle(false)
    await new Promise((r) => setTimeout(r, 20))
    expect(api.postConfig).not.toHaveBeenCalled()
  })

  it("applies after the confirm is accepted", async () => {
    await step2([{ type: "s3", label: "mine" }])
    await fireEvent.click(presetButton(3))
    await waitFor(() => expect(confirmState.current).not.toBeNull())
    settle(true)
    await waitFor(() => expect(api.postConfig).toHaveBeenCalled())
    expect(posted().connections).toEqual([{ type: "s3", label: "s3" }])
  })

  it("a preset whose plugins are missing shows the notice and saves nothing", async () => {
    vi.mocked(api.getBackends).mockResolvedValue({} as never)
    await step2()
    await fireEvent.click(presetButton(3))
    expect(await screen.findByText(/Your build is missing some plugins/)).toBeTruthy()
    expect(api.postConfig).not.toHaveBeenCalled()
  })

  it("asks about telemetry when leaving step 2 and saves acceptance", async () => {
    vi.mocked(api.getAdminConfig).mockImplementation(async () => config("$2a$hash", false) as never)
    render(SetupPage)
    await screen.findAllByRole("button", { name: "Apply preset" })
    await fireEvent.click(screen.getByRole("button", { name: "Previous step" }))
    await fireEvent.click(await screen.findByLabelText("The data is never shared with a third party."))
    await waitFor(() => expect(api.postConfig).toHaveBeenCalled())
    expect(posted().log.telemetry).toBe(true)
    expect(await screen.findByText("Welcome Aboard!")).toBeTruthy()
  })

  it("does not ask when telemetry is already on", async () => {
    await step2()
    await fireEvent.click(screen.getByRole("button", { name: "Previous step" }))
    expect(await screen.findByText("Welcome Aboard!")).toBeTruthy()
    expect(api.postConfig).not.toHaveBeenCalled()
  })
})

describe("about page", () => {
  afterEach(cleanup)

  it("renders the release html", async () => {
    vi.mocked(api.getRelease).mockResolvedValue({ html: "<table><tr><td>Filestash v1</td></tr></table>", version: "v1" })
    render(AboutPage)
    expect(await screen.findByText("Filestash v1")).toBeTruthy()
  })

  it("offers a retry when loading fails", async () => {
    vi.mocked(api.getRelease).mockRejectedValueOnce(new Error("x"))
    render(AboutPage)
    const retry = await screen.findByRole("button", { name: "Retry" })
    vi.mocked(api.getRelease).mockResolvedValue({ html: "<table><tr><td>ok</td></tr></table>", version: "" })
    await fireEvent.click(retry)
    expect(await screen.findByText("ok")).toBeTruthy()
  })
})
