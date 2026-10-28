import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte"

vi.mock("$lib/api/endpoints", () => ({
  getBackends: vi.fn(),
  getAuthMiddlewares: vi.fn(),
  getAdminConfig: vi.fn(),
  getPublicConfig: vi.fn(),
  postConfig: vi.fn(),
  getSession: vi.fn(async () => true),
  login: vi.fn(),
}))
vi.mock("svelte-sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

import * as api from "$lib/api/endpoints"
import { confirmState } from "$lib/confirm.svelte"
import ConfirmDialog from "$lib/components/ConfirmDialog.svelte"
import AuthenticationPage from "./AuthenticationPage.svelte"
import { navigate } from "$lib/router"
import type { Connection, Schema } from "$lib/types"

const el = (type: string, label: string, extra: Record<string, unknown> = {}) => ({
  label, type, default: null, value: null, readonly: false, required: false, ...extra,
})

const backends: Record<string, Schema> = {
  s3: { type: el("hidden", "type", { value: "s3" }), access_key_id: el("text", "access_key_id") },
  sftp: { type: el("hidden", "type", { value: "sftp" }), hostname: el("text", "hostname") },
}

const middlewares: Record<string, Schema> = {
  htpasswd: {
    banner: el("hidden", "banner", { description: "The plugin exposes 2 variables: {{ .user }} and {{ .password }}" }),
    type: el("hidden", "type", { value: "htpasswd" }),
    users: el("long_text", "users"),
  },
  ldap: {
    type: el("hidden", "type", { value: "ldap" }),
    hostname: el("text", "hostname", { description: "also gives {{ .mail }}" }),
  },
  admin: { type: el("hidden", "type", { value: "admin" }) },
}

const adminConfig = (method: string, related: string, params = "{}", mparams = "{}") => ({
  general: { name: el("text", "name", { value: "Filestash" }) },
  middleware: {
    identity_provider: {
      type: el("hidden", "type", { value: method }),
      params: el("hidden", "params", { value: mparams }),
    },
    attribute_mapping: {
      related_backend: el("hidden", "related_backend", { value: related }),
      params: el("hidden", "params", { value: params }),
    },
  },
})

function setup(connections: Connection[], method = "htpasswd", related = "s3", mparams = "{}") {
  vi.mocked(api.getBackends).mockResolvedValue(backends)
  vi.mocked(api.getAuthMiddlewares).mockResolvedValue(middlewares)
  vi.mocked(api.getAdminConfig).mockResolvedValue(adminConfig(method, related, "{}", mparams) as never)
  vi.mocked(api.getPublicConfig).mockResolvedValue({ connections, auth: [] })
  vi.mocked(api.postConfig).mockResolvedValue(undefined)
  render(ConfirmDialog)
  render(AuthenticationPage)
}

const both: Connection[] = [{ type: "s3", label: "s3" }, { type: "sftp", label: "sftp" }]
const posted = () => vi.mocked(api.postConfig).mock.calls[0][0] as Record<string, any>

async function ready() {
  return within(await screen.findByRole("group", { name: "Login method" }))
}

// the Save bar's main button
const saveButton = (name: string | RegExp) => screen.getByRole("button", { name })

async function answer(label: string) {
  const ask = await screen.findByRole("alertdialog")
  await fireEvent.click(within(ask).getByRole("button", { name: label }))
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
}

describe("authentication page", () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    cleanup()
    confirmState.current = null
  })

  it("switching methods keeps typed values", async () => {
    setup(both)
    const group = await ready()
    await fireEvent.input(screen.getByLabelText(/users/i), { target: { value: "bob:hash" } })
    await fireEvent.click(group.getByRole("button", { name: "ldap" }))
    expect(screen.queryByLabelText(/users/i)).toBeNull()
    await fireEvent.input(screen.getByLabelText(/hostname/i), { target: { value: "ldap.local" } })
    await fireEvent.click(group.getByRole("button", { name: "htpasswd" }))
    expect(screen.getByLabelText(/users/i)).toHaveValue("bob:hash")
    await fireEvent.click(group.getByRole("button", { name: "ldap" }))
    expect(screen.getByLabelText(/hostname/i)).toHaveValue("ldap.local")
  })

  it("lists None and the methods, hiding admin", async () => {
    setup(both)
    const group = await ready()
    const names = group.getAllByRole("button").map((b) => b.textContent)
    expect(names).toEqual(["None", "htpasswd", "ldap"])
  })

  it("lists the storages that sign in with the method and links to Storage", async () => {
    setup(both, "htpasswd", "s3, sftp")
    await ready()
    expect(screen.getByText(/Storages signing in with htpasswd: s3, sftp\./)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Go to Storage" })).toHaveAttribute("href", "/admin/storage")
  })

  it("nothing is posted until Save, and Save appears only after an edit", async () => {
    setup(both)
    await ready()
    expect(screen.queryByText("Unsaved changes")).toBeNull()
    await fireEvent.input(screen.getByLabelText(/users/i), { target: { value: "x" } })
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument()
    expect(api.postConfig).not.toHaveBeenCalled()
  })

  it("a method change warns, confirms, and saves the new method", async () => {
    setup(both)
    const group = await ready()
    await fireEvent.click(group.getByRole("button", { name: "ldap" }))
    expect(screen.getByText("s3 will now sign in with ldap.")).toBeInTheDocument()
    expect(screen.getByText("{{ .mail }}", { selector: "code" })).toBeInTheDocument()
    await fireEvent.input(screen.getByLabelText(/hostname/i), { target: { value: "ldap.local" } })
    await fireEvent.click(saveButton("Switch to ldap"))
    await answer("Switch")
    await waitFor(() => expect(api.postConfig).toHaveBeenCalledTimes(1))
    const body = posted()
    expect(body.middleware.identity_provider.type).toBe("ldap")
    expect(JSON.parse(body.middleware.identity_provider.params)).toEqual({ hostname: "ldap.local" })
    expect(body.middleware.attribute_mapping.related_backend).toBe("s3")
    expect(body.connections).toEqual(both)
  })

  it("cancelling the switch posts nothing and keeps the edit", async () => {
    setup(both)
    const group = await ready()
    await fireEvent.click(group.getByRole("button", { name: "ldap" }))
    await fireEvent.click(saveButton("Switch to ldap"))
    await answer("Cancel")
    expect(api.postConfig).not.toHaveBeenCalled()
    expect(group.getByRole("button", { name: "ldap" })).toHaveAttribute("aria-pressed", "true")
  })

  it("None removes the stored details of sign-in storages", async () => {
    setup(both, "htpasswd", "s3", "{}")
    const group = await ready()
    await fireEvent.click(group.getByRole("button", { name: "None" }))
    expect(screen.getByText(/will be removed/)).toBeInTheDocument()
    await fireEvent.click(saveButton("Switch to None"))
    await answer("Switch")
    await waitFor(() => expect(api.postConfig).toHaveBeenCalledTimes(1))
    expect(posted().middleware.identity_provider).toEqual({ type: "", params: "{}" })
    expect(posted().middleware.attribute_mapping).toEqual({ related_backend: "", params: "{}" })
  })

  it("a param edit with nothing affected saves without asking", async () => {
    setup(both)
    await ready()
    await fireEvent.input(screen.getByLabelText(/users/i), { target: { value: "bob:hash" } })
    await fireEvent.click(saveButton("Save"))
    await waitFor(() => expect(api.postConfig).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(JSON.parse(posted().middleware.identity_provider.params)).toEqual({ users: "bob:hash" })
  })

  it("Discard asks first, then restores the saved method", async () => {
    setup(both)
    const group = await ready()
    await fireEvent.click(group.getByRole("button", { name: "ldap" }))
    await fireEvent.click(screen.getByRole("button", { name: "Discard" }))
    await answer("Discard")
    expect(group.getByRole("button", { name: "htpasswd" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByText("Unsaved changes")).toBeNull()
    expect(api.postConfig).not.toHaveBeenCalled()
  })

  it("leaving the page with unsaved changes asks first", async () => {
    if (!document.querySelector("base")) document.head.append(Object.assign(document.createElement("base"), { href: "http://localhost:3000/" }))
    setup(both)
    const group = await ready()
    await fireEvent.click(group.getByRole("button", { name: "ldap" }))
    const leaving = navigate("admin/storage")
    await answer("Cancel")
    expect(await leaving).toBe(false)
  })

  it("the current method's button looks selected, the others do not", async () => {
    setup(both)
    const group = await ready()
    const on = group.getByRole("button", { name: "htpasswd" })
    const off = group.getByRole("button", { name: "ldap" })
    expect(on).toHaveAttribute("aria-pressed", "true")
    expect(on.className).toContain("bg-primary")
    expect(off.className).not.toContain("bg-primary")
  })

  it("a failed save keeps the edit with Switch enabled", async () => {
    setup(both)
    const group = await ready()
    await fireEvent.click(group.getByRole("button", { name: "ldap" }))
    vi.mocked(api.postConfig).mockRejectedValue(new Error("nope"))
    await fireEvent.click(saveButton("Switch to ldap"))
    await answer("Switch")
    await waitFor(() => expect(api.postConfig).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(saveButton("Switch to ldap")).toBeEnabled())
    expect(group.getByRole("button", { name: "ldap" })).toHaveAttribute("aria-pressed", "true")
  })

  it("lists the current method with a note when the methods fail to load", async () => {
    setup(both)
    vi.mocked(api.getAuthMiddlewares).mockRejectedValue(new Error("x"))
    cleanup()
    render(ConfirmDialog)
    render(AuthenticationPage)
    const group = await ready()
    expect(screen.getByText("Couldn't load the available login methods.")).toBeInTheDocument()
    expect(group.getByRole("button", { name: "htpasswd" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByRole("textbox")).toBeNull()
  })

  it("saves only the edited keys onto the server's current params", async () => {
    const atLoad = JSON.stringify({ users: "alice:h1", mfa: "bob" })
    const atSave = JSON.stringify({ users: "alice:h1", mfa: "bob,carol", added: "x" })
    setup(both, "htpasswd", "s3", atLoad)
    await ready()
    // the server changes after the page loads (plugins rewrite these params at runtime)
    vi.mocked(api.getAdminConfig).mockResolvedValue(adminConfig("htpasswd", "s3", "{}", atSave) as never)
    const users = screen.getByLabelText(/users/i)
    expect(users).toHaveValue("alice:h1")
    await fireEvent.input(users, { target: { value: "alice:h2" } })
    await fireEvent.click(saveButton("Save"))
    await waitFor(() => expect(api.postConfig).toHaveBeenCalledTimes(1))
    const idp = posted().middleware.identity_provider
    expect(idp.type).toBe("htpasswd")
    expect(JSON.parse(idp.params)).toEqual({ users: "alice:h2", mfa: "bob,carol", added: "x" })
  })

  it("a method change writes the new type with the page's params, not the server's", async () => {
    setup(both, "local", "s3", JSON.stringify({ users: [{ name: "bob" }] }))
    const group = await ready()
    await fireEvent.click(group.getByRole("button", { name: "ldap" }))
    expect(screen.getByText(/The local user list will be cleared\./)).toBeInTheDocument()
    await fireEvent.input(screen.getByLabelText(/hostname/i), { target: { value: "ldap.local" } })
    await fireEvent.click(saveButton("Switch to ldap"))
    await answer("Switch")
    await waitFor(() => expect(api.postConfig).toHaveBeenCalledTimes(1))
    expect(posted().middleware.identity_provider).toEqual({ type: "ldap", params: JSON.stringify({ hostname: "ldap.local" }) })
  })

  it("the switch applies to storages as the server has them at save time", async () => {
    setup(both, "htpasswd", "s3")
    const group = await ready()
    // another storage was set to sign in after the page loaded
    vi.mocked(api.getAdminConfig).mockResolvedValue(adminConfig("htpasswd", "s3, sftp") as never)
    await fireEvent.click(group.getByRole("button", { name: "ldap" }))
    await fireEvent.click(saveButton("Switch to ldap"))
    await answer("Switch")
    await waitFor(() => expect(api.postConfig).toHaveBeenCalledTimes(1))
    expect(posted().middleware.attribute_mapping.related_backend).toBe("s3, sftp")
  })
})
