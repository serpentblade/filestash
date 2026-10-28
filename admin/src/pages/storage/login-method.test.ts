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
import StoragePage from "./StoragePage.svelte"
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
  render(StoragePage)
}

const both: Connection[] = [{ type: "s3", label: "s3" }, { type: "sftp", label: "sftp" }]
const posted = () => vi.mocked(api.postConfig).mock.calls[0][0] as Record<string, any>

async function openDialog() {
  await fireEvent.click(await screen.findByRole("button", { name: "configure" }))
  const dialog = await screen.findByRole("dialog", { name: "Login method" })
  // the dialog reads the current method's params from the server first
  await waitFor(() => expect(within(dialog).queryByText("Loading…")).toBeNull())
  return dialog
}

describe("login method dialog", () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    cleanup()
    confirmState.current = null
  })

  it("switching methods in the dialog keeps typed values", async () => {
    setup(both)
    const dialog = await openDialog()
    await fireEvent.input(within(dialog).getByLabelText(/users/i), { target: { value: "bob:hash" } })
    await fireEvent.click(within(dialog).getByRole("button", { name: "ldap" }))
    expect(within(dialog).queryByLabelText(/users/i)).toBeNull()
    await fireEvent.input(within(dialog).getByLabelText(/hostname/i), { target: { value: "ldap.local" } })
    await fireEvent.click(within(dialog).getByRole("button", { name: "htpasswd" }))
    expect(within(dialog).getByLabelText(/users/i)).toHaveValue("bob:hash")
    await fireEvent.click(within(dialog).getByRole("button", { name: "ldap" }))
    expect(within(dialog).getByLabelText(/hostname/i)).toHaveValue("ldap.local")
  })

  it("lists None and the methods, hiding admin", async () => {
    setup(both)
    const dialog = await openDialog()
    const names = within(dialog).getAllByRole("button", { pressed: false }).map((b) => b.textContent)
    expect(names).toEqual(expect.arrayContaining(["None", "ldap"]))
    expect(names).not.toContain("admin")
  })

  it("shows the warning and a switch label, then saves with the new method", async () => {
    setup(both)
    const dialog = await openDialog()
    await fireEvent.click(within(dialog).getByRole("button", { name: "ldap" }))
    expect(within(dialog).getByText("s3 will now sign in with ldap.")).toBeInTheDocument()
    expect(within(dialog).getByText("{{ .mail }}", { selector: "code" })).toBeInTheDocument()
    await fireEvent.input(within(dialog).getByLabelText(/hostname/i), { target: { value: "ldap.local" } })
    await fireEvent.click(within(dialog).getByRole("button", { name: "Switch to ldap" }))
    await waitFor(() => expect(api.postConfig).toHaveBeenCalledTimes(1))
    const idp = posted().middleware.identity_provider
    expect(idp.type).toBe("ldap")
    expect(JSON.parse(idp.params)).toEqual({ hostname: "ldap.local" })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Login method" })).toBeNull())
  })

  it("None removes the stored details of sign-in storages", async () => {
    setup(both)
    const dialog = await openDialog()
    await fireEvent.click(within(dialog).getByRole("button", { name: "None" }))
    expect(within(dialog).getByText(/will be removed/)).toBeInTheDocument()
    await fireEvent.click(within(dialog).getByRole("button", { name: "Switch to None" }))
    await waitFor(() => expect(api.postConfig).toHaveBeenCalledTimes(1))
    expect(posted().middleware.identity_provider.type).toBe("")
    expect(posted().middleware.attribute_mapping.related_backend).toBe("")
  })

  it("other unsaved changes need confirming; cancel posts nothing and keeps the dialog", async () => {
    setup(both)
    await fireEvent.input(await screen.findByLabelText("Name"), { target: { value: "renamed" } })
    const dialog = await openDialog()
    await fireEvent.click(within(dialog).getByRole("button", { name: "ldap" }))
    await fireEvent.click(within(dialog).getByRole("button", { name: "Switch to ldap" }))
    const ask = await screen.findByRole("alertdialog")
    expect(within(ask).getByText("Save other changes too?")).toBeInTheDocument()
    expect(within(ask).getByText(/This also saves your other unsaved changes\./)).toBeInTheDocument()
    await fireEvent.click(within(ask).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(api.postConfig).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog", { name: "Login method" })).toBeInTheDocument()
  })

  it("closing with typed changes confirms first", async () => {
    setup(both)
    const dialog = await openDialog()
    await fireEvent.input(within(dialog).getByLabelText(/users/i), { target: { value: "x" } })
    await fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    const ask = await screen.findByRole("alertdialog")
    await fireEvent.click(within(ask).getByRole("button", { name: "Discard" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Login method" })).toBeNull())
    expect(api.postConfig).not.toHaveBeenCalled()
  })

  it("the storage hint shows the variables of the current method", async () => {
    setup(both)
    await screen.findByRole("button", { name: "configure" })
    expect(await screen.findByText("{{ .user }} {{ .password }}")).toBeInTheDocument()
  })

  it("Set up a login method first opens the dialog", async () => {
    setup([{ type: "s3", label: "s3" }], "", "")
    await fireEvent.click(await screen.findByText("Set up a login method first"))
    expect(await screen.findByRole("dialog", { name: "Login method" })).toBeInTheDocument()
  })

  it("the current method's button looks selected, the others do not", async () => {
    setup(both)
    const dialog = await openDialog()
    const on = within(dialog).getByRole("button", { name: "htpasswd" })
    const off = within(dialog).getByRole("button", { name: "ldap" })
    expect(on).toHaveAttribute("aria-pressed", "true")
    expect(on.className).toContain("bg-primary")
    expect(off.className).not.toContain("bg-primary")
  })

  it("a failed save keeps the dialog open with Save enabled and the draft unchanged", async () => {
    setup(both)
    const dialog = await openDialog()
    await fireEvent.click(within(dialog).getByRole("button", { name: "ldap" }))
    vi.mocked(api.postConfig).mockRejectedValue(new Error("nope"))
    await fireEvent.click(within(dialog).getByRole("button", { name: "Switch to ldap" }))
    await waitFor(() => expect(api.postConfig).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Switch to ldap" })).toBeEnabled())
    expect(screen.getByRole("dialog", { name: "Login method" })).toBeInTheDocument()
    await fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    const ask = await screen.findByRole("alertdialog")
    await fireEvent.click(within(ask).getByRole("button", { name: "Discard" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Login method" })).toBeNull())
    expect(screen.getByText(/Login method: htpasswd/)).toBeInTheDocument()
    expect(screen.queryByText("Unsaved changes")).toBeNull()
  })

  it("lists the current method with a note when the methods fail to load", async () => {
    setup(both)
    vi.mocked(api.getAuthMiddlewares).mockRejectedValue(new Error("x"))
    cleanup()
    render(ConfirmDialog)
    render(StoragePage)
    const dialog = await openDialog()
    expect(within(dialog).getByText("Couldn't load the available login methods.")).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "htpasswd" })).toHaveAttribute("aria-pressed", "true")
    expect(within(dialog).queryByRole("textbox")).toBeNull()
  })

  it("seeds the current method from the server and saves only the edited keys onto fresh params", async () => {
    const atLoad = JSON.stringify({ users: "alice:h0" })
    const atOpen = JSON.stringify({ users: "alice:h1", mfa: "bob" })
    const atSave = JSON.stringify({ users: "alice:h1", mfa: "bob,carol", added: "x" })
    setup(both, "htpasswd", "s3", atLoad)
    // the page has loaded atLoad by now; the server changes before the dialog opens and again before the save
    vi.mocked(api.getAdminConfig)
      .mockResolvedValueOnce(adminConfig("htpasswd", "s3", "{}", atOpen) as never)
      .mockResolvedValue(adminConfig("htpasswd", "s3", "{}", atSave) as never)
    const dialog = await openDialog()
    const users = await within(dialog).findByLabelText(/users/i)
    expect(users).toHaveValue("alice:h1")
    await fireEvent.input(users, { target: { value: "alice:h2" } })
    await fireEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(api.postConfig).toHaveBeenCalledTimes(1))
    const idp = posted().middleware.identity_provider
    expect(idp.type).toBe("htpasswd")
    expect(JSON.parse(idp.params)).toEqual({ users: "alice:h2", mfa: "bob,carol", added: "x" })
  })

  it("a method change writes the new type with the dialog's params, not the server's", async () => {
    setup(both, "local", "s3", JSON.stringify({ users: [{ name: "bob" }] }))
    const dialog = await openDialog()
    await fireEvent.click(within(dialog).getByRole("button", { name: "ldap" }))
    expect(within(dialog).getByText(/The local user list will be cleared\./)).toBeInTheDocument()
    await fireEvent.input(within(dialog).getByLabelText(/hostname/i), { target: { value: "ldap.local" } })
    await fireEvent.click(within(dialog).getByRole("button", { name: "Switch to ldap" }))
    await waitFor(() => expect(api.postConfig).toHaveBeenCalledTimes(1))
    expect(posted().middleware.identity_provider).toEqual({ type: "ldap", params: JSON.stringify({ hostname: "ldap.local" }) })
  })
})
