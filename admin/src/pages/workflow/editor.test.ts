import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte"

vi.mock("$lib/api/endpoints", () => ({
  getWorkflows: vi.fn(),
  getWorkflow: vi.fn(),
  upsertWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
}))
vi.mock("svelte-sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

import * as api from "$lib/api/endpoints"
import { confirmState, settle } from "$lib/confirm.svelte"
import { route } from "$lib/router"
import { setPendingNew } from "./model"
import WorkflowEditor from "./WorkflowEditor.svelte"

const el = (label: string) => ({ label, type: "text", default: null, value: null, readonly: false, required: false })
const spec = (name: string, title: string, fields: string[] = []) => ({
  name, title, icon: "<svg></svg>", specs: Object.fromEntries(fields.map((f) => [f, el(f)])),
})
const triggers = [spec("schedule", "On a Schedule", ["cron"])]
const actions = [spec("notify/email", "Notify", ["email"]), spec("tools/debug", "Debug")]

const existing = {
  id: "w1", name: "Nightly", published: true,
  trigger: { name: "schedule", params: { cron: "@daily" } },
  actions: [{ name: "notify/email", params: { email: "a@b.c" } }, { name: "tools/debug" }],
  history: [],
}

const order = () => screen.getAllByRole("group").map((g) => g.getAttribute("aria-label"))

describe("workflow editor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getWorkflows).mockResolvedValue({ workflows: [], triggers, actions } as any)
    vi.mocked(api.getWorkflow).mockResolvedValue(existing as any)
    vi.mocked(api.upsertWorkflow).mockResolvedValue(undefined)
    vi.mocked(api.deleteWorkflow).mockResolvedValue(undefined)
    history.replaceState(null, "", "/")
  })
  afterEach(() => cleanup())

  it("reorders actions and saves them in the new order", async () => {
    route.set({ name: "workflow-edit", params: { id: "w1" }, query: new URLSearchParams() })
    render(WorkflowEditor)
    await screen.findByLabelText("Workflow name")
    expect(order()).toEqual(["On a Schedule", "Notify", "Debug"])
    await fireEvent.click(screen.getAllByLabelText("Move up")[1])
    expect(order()).toEqual(["On a Schedule", "Debug", "Notify"])
    await fireEvent.click(screen.getByText("Save"))
    await waitFor(() => expect(api.upsertWorkflow).toHaveBeenCalled())
    expect(vi.mocked(api.upsertWorkflow).mock.calls[0][0]).toEqual({
      id: "w1", name: "Nightly", published: true,
      trigger: { name: "schedule", params: { cron: "@daily" } },
      actions: [{ name: "tools/debug" }, { name: "notify/email", params: { email: "a@b.c" } }],
    })
  })

  it("delete asks through the confirm dialog", async () => {
    route.set({ name: "workflow-edit", params: { id: "w1" }, query: new URLSearchParams() })
    render(WorkflowEditor)
    await fireEvent.click(await screen.findByText("Delete"))
    await waitFor(() => expect(confirmState.current?.title).toBe("Delete Nightly?"))
    expect(api.deleteWorkflow).not.toHaveBeenCalled()
    settle(true)
    await waitFor(() => expect(api.deleteWorkflow).toHaveBeenCalledWith("w1"))
  })

  it("a new workflow from the create dialog opens unsaved", async () => {
    setPendingNew({ name: "Fresh", published: false, trigger: { name: "schedule" }, actions: [{ name: "tools/debug" }] })
    route.set({ name: "workflow-new", params: {}, query: new URLSearchParams() })
    render(WorkflowEditor)
    const input = (await screen.findByLabelText("Workflow name")) as HTMLInputElement
    expect(input.value).toBe("Fresh")
    expect(api.getWorkflow).not.toHaveBeenCalled()
    await fireEvent.click(screen.getByText("Save"))
    await waitFor(() => expect(api.upsertWorkflow).toHaveBeenCalled())
    const sent = vi.mocked(api.upsertWorkflow).mock.calls[0][0]
    expect(sent.id).toMatch(/^[0-9a-z]+$/)
    expect(sent).toMatchObject({ name: "Fresh", published: false, trigger: { name: "schedule" }, actions: [{ name: "tools/debug" }] })
    await waitFor(() => expect(location.pathname).toBe(`/admin/workflow/${sent.id}`))
  })
})
