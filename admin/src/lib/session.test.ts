import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "$lib/api/http"

vi.mock("$lib/api/endpoints", () => ({
  getSession: vi.fn(),
  login: vi.fn(),
}))

import * as api from "$lib/api/endpoints"
import { session } from "./session.svelte"

beforeEach(() => {
  vi.resetAllMocks()
  session.isAdmin = null
  session.loginOpen = false
})
afterEach(() => vi.useRealTimers())

describe("session", () => {
  it("start polls every 30s", async () => {
    vi.useFakeTimers()
    vi.mocked(api.getSession).mockResolvedValue(true)
    const stop = session.start()
    expect(api.getSession).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30000)
    expect(api.getSession).toHaveBeenCalledTimes(2)
    stop()
    await vi.advanceTimersByTimeAsync(60000)
    expect(api.getSession).toHaveBeenCalledTimes(2)
  })

  it("refreshes when the tab becomes visible", async () => {
    vi.mocked(api.getSession).mockResolvedValue(true)
    const stop = session.start()
    document.dispatchEvent(new Event("visibilitychange"))
    expect(api.getSession).toHaveBeenCalledTimes(2)
    stop()
  })

  it("opens login when isAdmin goes true to false", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    await session.refresh()
    expect(session.loginOpen).toBe(false)
    await session.refresh()
    expect(session.isAdmin).toBe(false)
    expect(session.loginOpen).toBe(true)
  })

  it("does not open login on first false", async () => {
    vi.mocked(api.getSession).mockResolvedValue(false)
    await session.refresh()
    expect(session.loginOpen).toBe(false)
  })

  it("login success closes dialog", async () => {
    vi.mocked(api.login).mockResolvedValue(undefined)
    session.loginOpen = true
    await session.login("pw")
    expect(api.login).toHaveBeenCalledWith("pw")
    expect(session.isAdmin).toBe(true)
    expect(session.loginOpen).toBe(false)
  })

  it("login failure rethrows and leaves dialog open", async () => {
    vi.mocked(api.login).mockRejectedValue(new ApiError("FORBIDDEN", "bad", 401))
    session.loginOpen = true
    await expect(session.login("x")).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(session.loginOpen).toBe(true)
  })
})
