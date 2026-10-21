import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte"

vi.mock("$lib/api/endpoints", () => ({
  getAdminConfig: vi.fn(),
  getPublicConfig: vi.fn(),
  postConfig: vi.fn(),
  getAudit: vi.fn(),
  getLogs: vi.fn(),
  logsUrl: vi.fn(() => "/admin/api/logs"),
}))
vi.mock("svelte-sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

import * as api from "$lib/api/endpoints"
import { ApiError } from "$lib/api/http"
import { session } from "$lib/session.svelte"
import { confirmState } from "$lib/confirm.svelte"
import Audit from "./Audit.svelte"
import LogSettings from "./LogSettings.svelte"
import LogViewer from "./LogViewer.svelte"
import LogChart from "./LogChart.svelte"
import { poll } from "$lib/hooks/poll"

const el = (type: string, label: string, extra: Record<string, unknown> = {}) => ({
  label, type, default: null, value: null, readonly: false, required: false, ...extra,
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  confirmState.current = null
})

describe("audit", () => {
  const form = { search: { q: el("text", "q", { value: "" }) } }
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getAudit).mockResolvedValue({ form: form as never, render: "<b>rows</b>" })
  })

  it("re-queries 1000ms after the last edit with search. stripped", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(Audit)
    const q = await screen.findByLabelText("q")
    expect(api.getAudit).toHaveBeenCalledTimes(1)
    await fireEvent.input(q, { target: { value: "a" } })
    await vi.advanceTimersByTimeAsync(600)
    await fireEvent.input(q, { target: { value: "ab" } })
    await vi.advanceTimersByTimeAsync(600)
    expect(api.getAudit).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(500)
    expect(api.getAudit).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.getAudit).mock.calls[1][0].toString()).toBe("q=ab")
    expect(screen.getByText("rows")).toBeInTheDocument()
  })

  it("ignores a stale response", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(Audit)
    const q = await screen.findByLabelText("q")
    let slow!: (v: never) => void
    vi.mocked(api.getAudit).mockImplementationOnce(() => new Promise((r) => (slow = r as never)))
    await fireEvent.input(q, { target: { value: "a" } })
    await vi.advanceTimersByTimeAsync(1100)
    vi.mocked(api.getAudit).mockResolvedValueOnce({ form: form as never, render: "<i>new</i>" })
    await fireEvent.input(q, { target: { value: "ab" } })
    await vi.advanceTimersByTimeAsync(1100)
    slow({ form, render: "<i>old</i>" } as never)
    await vi.advanceTimersByTimeAsync(10)
    expect(screen.getByText("new")).toBeInTheDocument()
    expect(screen.queryByText("old")).toBeNull()
  })
})

describe("log settings", () => {
  it("save sends the edited log and keeps the fresh server values for the rest", async () => {
    vi.clearAllMocks()
    const cfg = () => ({
      general: { name: el("text", "name", { value: "Filestash" }) },
      log: { level: el("text", "level", { value: "INFO" }) },
      middleware: { identity_provider: { type: el("hidden", "type", { value: "htpasswd" }) } },
    })
    vi.mocked(api.getAdminConfig).mockResolvedValue(cfg() as never)
    vi.mocked(api.getPublicConfig).mockResolvedValue({ connections: [], auth: [] })
    vi.mocked(api.postConfig).mockResolvedValue(undefined)
    render(LogSettings)
    await fireEvent.input(await screen.findByLabelText("level"), { target: { value: "DEBUG" } })
    const fresh = cfg() as Record<string, any>
    fresh.general.name.value = "Changed elsewhere"
    vi.mocked(api.getAdminConfig).mockResolvedValue(fresh as never)
    await fireEvent.click(await screen.findByRole("button", { name: "Save" }))
    await waitFor(() => expect(api.postConfig).toHaveBeenCalled())
    const body = vi.mocked(api.postConfig).mock.calls[0][0] as Record<string, any>
    expect(body.log.level).toBe("DEBUG")
    expect(body.general.name).toBe("Changed elsewhere")
    expect(body.middleware.identity_provider.type).toBe("htpasswd")
  })
})

describe("log polling errors", () => {
  beforeEach(() => vi.clearAllMocks())

  it("viewer shows an error, then clears it on the next success", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(api.getLogs).mockRejectedValueOnce(new Error("boom")).mockResolvedValue("ok line")
    render(LogViewer)
    expect(await screen.findByText("Couldn't load logs")).toBeInTheDocument()
    await vi.advanceTimersByTimeAsync(2600)
    await waitFor(() => expect(screen.queryByText("Couldn't load logs")).toBeNull())
    expect(screen.getByText("ok line")).toBeInTheDocument()
  })

  it("chart: FORBIDDEN opens the login dialog and shows the error", async () => {
    const spy = vi.spyOn(session, "requireLogin")
    vi.mocked(api.getLogs).mockRejectedValue(new ApiError("FORBIDDEN", "no"))
    render(LogChart)
    expect(await screen.findByText("Couldn't load logs")).toBeInTheDocument()
    expect(spy).toHaveBeenCalled()
  })

  it("chart: empty log says so instead of drawing a legend", async () => {
    vi.mocked(api.getLogs).mockResolvedValue("")
    render(LogChart)
    expect(await screen.findByText("No log events yet")).toBeInTheDocument()
    expect(screen.queryByText("Log Events")).toBeNull()
  })
})

describe("poll", () => {
  it("first call runs while hidden, later ticks wait for visibility", async () => {
    vi.useFakeTimers()
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true })
    const fn = vi.fn()
    const stop = poll(fn, 100)
    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(500)
    expect(fn).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false })
    document.dispatchEvent(new Event("visibilitychange"))
    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(2)
    stop()
  })
})
