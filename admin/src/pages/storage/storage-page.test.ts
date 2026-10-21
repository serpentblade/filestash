import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte"

vi.mock("$lib/api/endpoints", () => ({
  getBackends: vi.fn(),
  getAdminConfig: vi.fn(),
  getPublicConfig: vi.fn(),
  postConfig: vi.fn(),
  getSession: vi.fn(async () => true),
  login: vi.fn(),
}))
vi.mock("svelte-sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

import * as api from "$lib/api/endpoints"
import { toast } from "svelte-sonner"
import { confirmState } from "$lib/confirm.svelte"
import ConfirmDialog from "$lib/components/ConfirmDialog.svelte"
import StoragePage from "./StoragePage.svelte"
import type { Connection, Schema } from "$lib/types"

const el = (type: string, label: string, extra: Record<string, unknown> = {}) => ({
  label, type, default: null, value: null, readonly: false, required: false, ...extra,
})

const backends: Record<string, Schema> = {
  s3: {
    type: el("hidden", "type", { value: "s3" }),
    access_key_id: el("text", "access_key_id"),
    secret_access_key: el("password", "secret_access_key"),
  },
  sftp: {
    type: el("hidden", "type", { value: "sftp" }),
    hostname: el("text", "hostname"),
  },
}

const adminConfig = (method: string, related: string, params = "{}") => ({
  general: { name: el("text", "name", { value: "Filestash" }) },
  middleware: {
    identity_provider: {
      type: el("hidden", "type", { value: method }),
      params: el("hidden", "params", { value: "{}" }),
    },
    attribute_mapping: {
      related_backend: el("hidden", "related_backend", { value: related }),
      params: el("hidden", "params", { value: params }),
    },
  },
})

function setup(connections: Connection[], method = "htpasswd", related = "s3") {
  vi.mocked(api.getBackends).mockResolvedValue(backends)
  vi.mocked(api.getAdminConfig).mockResolvedValue(adminConfig(method, related) as never)
  vi.mocked(api.getPublicConfig).mockResolvedValue({ connections, auth: [] })
  vi.mocked(api.postConfig).mockResolvedValue(undefined)
  render(ConfirmDialog)
  render(StoragePage)
}

const card = (name: string) => screen.findByRole("button", { name: new RegExp(`^${name}\\b`) })
const posted = () => vi.mocked(api.postConfig).mock.calls[0][0] as Record<string, any>

describe("storage page", () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    cleanup()
    confirmState.current = null
  })

  it("adding S3 opens a create form, not a duplicate row", async () => {
    setup([{ type: "sftp", label: "sftp" }], "htpasswd", "")
    await card("sftp")
    await fireEvent.click(screen.getByRole("button", { name: "Add storage" }))
    const dialog = await screen.findByRole("dialog")
    await fireEvent.click(within(dialog).getByRole("button", { name: "s3" }))
    expect(within(dialog).getByLabelText("Name")).toHaveValue("s3")
    await fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(screen.getAllByText("Users enter their own login")).toHaveLength(1)
    expect(api.postConfig).not.toHaveBeenCalled()
  })

  it("a second S3 gets a distinct default name", async () => {
    setup([{ type: "s3", label: "s3" }])
    await card("s3")
    await fireEvent.click(screen.getByRole("button", { name: "Add storage" }))
    const dialog = await screen.findByRole("dialog")
    await fireEvent.click(within(dialog).getByRole("button", { name: "s3" }))
    expect(within(dialog).getByLabelText("Name")).toHaveValue("s3 2")
  })

  it("cancel after typing asks first", async () => {
    setup([])
    await fireEvent.click(await screen.findByRole("button", { name: "Add storage" }))
    const dialog = await screen.findByRole("dialog")
    await fireEvent.click(within(dialog).getByRole("button", { name: "s3" }))
    await fireEvent.input(within(dialog).getByLabelText("Name"), { target: { value: "Company files" } })
    await fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Discard this storage?")
  })

  it("create appends, saves and selects", async () => {
    setup([{ type: "s3", label: "s3" }])
    await card("s3")
    await fireEvent.click(screen.getByRole("button", { name: "Add storage" }))
    const dialog = await screen.findByRole("dialog")
    await fireEvent.click(within(dialog).getByRole("button", { name: "sftp" }))
    await fireEvent.click(within(dialog).getByRole("button", { name: "Create" }))
    await waitFor(() => expect(api.postConfig).toHaveBeenCalledTimes(1))
    expect(posted().connections).toEqual([{ type: "s3", label: "s3" }, { type: "sftp", label: "sftp" }])
    expect(await screen.findByRole("button", { name: /^sftp\b/, pressed: true })).toBeInTheDocument()
  })

  it("switching mode back and forth keeps typed details", async () => {
    setup([{ type: "s3", label: "s3" }])
    await fireEvent.click(await card("s3"))
    await fireEvent.input(screen.getByLabelText("access_key_id"), { target: { value: "AKIA1" } })
    await fireEvent.click(screen.getByRole("radio", { name: /enter their own S3 login/ }))
    expect(screen.queryByLabelText("access_key_id")).toBeNull()
    expect(screen.getByText("The stored connection details will be removed when you save.")).toBeInTheDocument()
    await fireEvent.click(screen.getByRole("radio", { name: /sign in with htpasswd/ }))
    expect(screen.getByLabelText("access_key_id")).toHaveValue("AKIA1")
  })

  it("nothing is posted until Save", async () => {
    setup([{ type: "s3", label: "s3" }])
    await fireEvent.click(await card("s3"))
    await fireEvent.input(screen.getByLabelText("access_key_id"), { target: { value: "AKIA1" } })
    await fireEvent.input(screen.getByLabelText("secret_access_key"), { target: { value: "s" } })
    await fireEvent.input(screen.getByLabelText("secret_access_key"), { target: { value: "" } })
    await fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Company files" } })
    expect(api.postConfig).not.toHaveBeenCalled()
    await fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(api.postConfig).toHaveBeenCalledTimes(1))
    const body = posted()
    expect(body.connections).toEqual([{ type: "s3", label: "Company files" }])
    expect(body.general).toEqual({ name: "Filestash" })
    expect(body.middleware.attribute_mapping).toEqual({
      related_backend: "Company files",
      params: JSON.stringify({ "Company files": { type: "s3", access_key_id: "AKIA1" } }),
    })
    expect(toast.success).toHaveBeenCalledWith("Saved")
  })

  it("sign in is disabled without a login method", async () => {
    setup([{ type: "s3", label: "s3" }], "", "")
    await fireEvent.click(await card("s3"))
    expect(screen.getByRole("radio", { name: /sign in with/i })).toBeDisabled()
    expect(screen.getByText("Set up a login method first")).toBeInTheDocument()
    expect(screen.getByText(/Login method: None/)).toBeInTheDocument()
  })

  it("duplicate names block save", async () => {
    setup([{ type: "s3", label: "s3" }, { type: "s3", label: "s3" }])
    expect(await screen.findAllByRole("button", { name: /^s3\b/ })).toHaveLength(2)
    expect(screen.getAllByText("Duplicate name")).toHaveLength(2)
    await fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(screen.getByRole("alert")).toHaveTextContent(/named "s3"/)
    expect(api.getAdminConfig).toHaveBeenCalledTimes(1)
    expect(api.postConfig).not.toHaveBeenCalled()
  })

  it("delete asks for confirmation", async () => {
    setup([{ type: "s3", label: "s3" }, { type: "sftp", label: "sftp" }], "htpasswd", "s3, sftp")
    await fireEvent.click(await card("sftp"))
    await fireEvent.click(screen.getByRole("button", { name: "Delete storage" }))
    const alert = await screen.findByRole("alertdialog")
    expect(alert).toHaveTextContent("Delete sftp?")
    await fireEvent.click(within(alert).getByRole("button", { name: "Cancel" }))
    expect(api.postConfig).not.toHaveBeenCalled()

    await fireEvent.click(screen.getByRole("button", { name: "Delete storage" }))
    await fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(api.postConfig).toHaveBeenCalledTimes(1))
    expect(posted().connections).toEqual([{ type: "s3", label: "s3" }])
    expect(posted().middleware.attribute_mapping.related_backend).toBe("s3")
  })

  it("discard with changes asks for confirmation", async () => {
    setup([{ type: "s3", label: "s3" }])
    await fireEvent.click(await card("s3"))
    await fireEvent.input(screen.getByLabelText("Name"), { target: { value: "x" } })
    await fireEvent.click(screen.getByRole("button", { name: "Discard" }))
    const alert = await screen.findByRole("alertdialog")
    await fireEvent.click(within(alert).getByRole("button", { name: "Discard" }))
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("s3"))
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
  })

  it("leftovers can be removed", async () => {
    vi.mocked(api.getBackends).mockResolvedValue(backends)
    vi.mocked(api.getAdminConfig).mockResolvedValue(
      adminConfig("htpasswd", "s3, gone", JSON.stringify({ s3: { type: "s3" }, gone: { type: "s3", x: "1" } })) as never,
    )
    vi.mocked(api.getPublicConfig).mockResolvedValue({ connections: [{ type: "s3", label: "s3" }], auth: [] })
    vi.mocked(api.postConfig).mockResolvedValue(undefined)
    render(ConfirmDialog)
    render(StoragePage)
    expect(await screen.findByText("2 leftover settings from an older configuration")).toBeInTheDocument()
    await fireEvent.click(screen.getByRole("button", { name: "Remove leftovers" }))
    await fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove" }))
    await fireEvent.click(await screen.findByRole("button", { name: "Save" }))
    await waitFor(() => expect(api.postConfig).toHaveBeenCalledTimes(1))
    expect(posted().middleware.attribute_mapping).toEqual({
      related_backend: "s3",
      params: JSON.stringify({ s3: { type: "s3" } }),
    })
  })

  it("the confirm renders above the create dialog and Discard closes both", async () => {
    setup([])
    await fireEvent.click(await screen.findByRole("button", { name: "Add storage" }))
    const dialog = await screen.findByRole("dialog")
    await fireEvent.click(within(dialog).getByRole("button", { name: "s3" }))
    await fireEvent.input(within(dialog).getByLabelText("Name"), { target: { value: "typed" } })
    await fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    const alert = await screen.findByRole("alertdialog")
    const z = (node: Element | null) => Number(/(?:^|\s)z-\[?(\d+)\]?(?:\s|$)/.exec(node?.getAttribute("class") ?? "")?.[1] ?? 0)
    const dialogOverlay = document.querySelector('[data-slot="dialog-overlay"]')
    const alertOverlay = document.querySelector('[data-slot="alert-dialog-overlay"]')
    expect(z(alert)).toBeGreaterThan(z(dialog))
    expect(z(alertOverlay)).toBeGreaterThan(z(dialog))
    expect(z(alertOverlay)).toBeGreaterThan(z(dialogOverlay))
    await fireEvent.click(within(alert).getByRole("button", { name: "Discard" }))
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull()
      expect(screen.queryByRole("dialog")).toBeNull()
    })
  })

  it("delete with other unsaved changes says it saves them too", async () => {
    setup([{ type: "s3", label: "s3" }, { type: "sftp", label: "sftp" }], "htpasswd", "s3, sftp")
    await fireEvent.click(await card("s3"))
    await fireEvent.click(screen.getByRole("radio", { name: /enter their own S3 login/ }))
    await fireEvent.click(await card("sftp"))
    await fireEvent.click(screen.getByRole("button", { name: "Delete storage" }))
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("also saves your other unsaved changes")
  })

  it("delete on a clean draft doesn't mention other changes", async () => {
    setup([{ type: "s3", label: "s3" }, { type: "sftp", label: "sftp" }], "htpasswd", "s3, sftp")
    await fireEvent.click(await card("sftp"))
    await fireEvent.click(screen.getByRole("button", { name: "Delete storage" }))
    expect(await screen.findByRole("alertdialog")).not.toHaveTextContent("also saves your other unsaved changes")
  })

  it("create with other unsaved changes asks first; cancel keeps everything", async () => {
    setup([{ type: "s3", label: "s3" }])
    await fireEvent.click(await card("s3"))
    await fireEvent.input(screen.getByLabelText("Name"), { target: { value: "renamed" } })
    await fireEvent.click(screen.getByRole("button", { name: "Add storage" }))
    const dialog = await screen.findByRole("dialog")
    await fireEvent.click(within(dialog).getByRole("button", { name: "sftp" }))
    await fireEvent.click(within(dialog).getByRole("button", { name: "Create" }))
    const alert = await screen.findByRole("alertdialog")
    expect(alert).toHaveTextContent("Save other changes too?")
    expect(alert).toHaveTextContent("This also saves your other unsaved changes.")
    await fireEvent.click(within(alert).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(api.postConfig).not.toHaveBeenCalled()
    const list = within(screen.getByRole("list", { name: "Storages" }))
    expect(list.getAllByRole("button").map((b) => b.textContent?.trim().split(/\s/)[0])).toEqual(["renamed"])
    expect(screen.getByLabelText("Name", { selector: "#c0-name" })).toHaveValue("renamed")
  })

  it("create with other unsaved changes saves all on confirm", async () => {
    setup([{ type: "s3", label: "s3" }])
    await fireEvent.click(await card("s3"))
    await fireEvent.input(screen.getByLabelText("Name"), { target: { value: "renamed" } })
    await fireEvent.click(screen.getByRole("button", { name: "Add storage" }))
    const dialog = await screen.findByRole("dialog")
    await fireEvent.click(within(dialog).getByRole("button", { name: "sftp" }))
    await fireEvent.click(within(dialog).getByRole("button", { name: "Create" }))
    await fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save all" }))
    await waitFor(() => expect(api.postConfig).toHaveBeenCalledTimes(1))
    expect(posted().connections).toEqual([{ type: "s3", label: "renamed" }, { type: "sftp", label: "sftp" }])
  })

  it("blocked names disable Create, and Delete unless it clears the block", async () => {
    setup([{ type: "s3", label: "s3" }, { type: "s3", label: "s3" }, { type: "sftp", label: "sftp" }], "htpasswd", "")
    await fireEvent.click(await card("sftp"))
    expect(screen.getByRole("button", { name: "Delete storage" })).toBeDisabled()
    expect(screen.getByText(/Two storages are named "s3"/, { selector: "#delete-blocked" })).toBeInTheDocument()
    await fireEvent.click(screen.getAllByRole("button", { name: /^s3\b/ })[1])
    expect(screen.getByRole("button", { name: "Delete storage" })).toBeEnabled()

    await fireEvent.click(screen.getByRole("button", { name: "Add storage" }))
    const dialog = await screen.findByRole("dialog")
    await fireEvent.click(within(dialog).getByRole("button", { name: "sftp" }))
    expect(within(dialog).getByRole("button", { name: "Create" })).toBeDisabled()
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/Two storages are named "s3"/)
  })
})
