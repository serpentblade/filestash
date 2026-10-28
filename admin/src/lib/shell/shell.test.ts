import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte"
import { tick } from "svelte"

vi.mock("$lib/api/endpoints", () => ({
  getSession: vi.fn(async () => true),
  login: vi.fn(async () => {}),
  getRelease: vi.fn(async () => ({ html: "", version: "v1.2" })),
}))

vi.mock("$lib/redirect", () => ({ redirect: vi.fn() }))

import App from "../../App.svelte"
import { redirect } from "$lib/redirect"
import { session } from "$lib/session.svelte"
import { navigate } from "$lib/router"
import { getSession, login } from "$lib/api/endpoints"
import { ApiError } from "$lib/api/http"
import LoginForm from "./LoginForm.svelte"

describe("shell", () => {
  beforeEach(async () => {
    // the real page has <base href>; without it baseURI follows the current location
    if (!document.querySelector("base")) document.head.append(Object.assign(document.createElement("base"), { href: "http://localhost:3000/" }))
    history.replaceState(null, "", "/admin/storage")
    await navigate("admin/storage")
  })
  afterEach(() => {
    cleanup()
    session.isAdmin = null
    session.loginOpen = false
  })

  it("shows login form when not admin", async () => {
    vi.mocked(getSession).mockResolvedValue(false)
    session.isAdmin = false
    render(App)
    expect(await screen.findByLabelText("Password")).toBeInTheDocument()
    expect(screen.queryByRole("navigation")).toBeNull()
  })

  it("shows sidebar when admin", async () => {
    vi.mocked(getSession).mockResolvedValue(true)
    session.isAdmin = true
    render(App)
    const item = await screen.findByRole("link", { name: "Storage" })
    expect(item).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Activity" })).not.toHaveAttribute("aria-current")
  })

  it("expired session opens dialog without unmounting page", async () => {
    vi.mocked(getSession).mockResolvedValue(true)
    session.isAdmin = true
    await navigate("admin/settings")
    render(App)
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument()
    session.loginOpen = true
    await tick()
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument()
  })

  it("shows page not found for unknown routes", async () => {
    vi.mocked(getSession).mockResolvedValue(true)
    session.isAdmin = true
    await navigate("admin/nope")
    render(App)
    expect(await screen.findByText("Page not found")).toBeInTheDocument()
  })

  it("shows a loading state while the first check is pending", async () => {
    vi.mocked(getSession).mockReturnValue(new Promise(() => {}))
    render(App)
    expect(await screen.findByRole("status", { name: "Loading" })).toBeInTheDocument()
  })

  it("offers retry when the first check fails", async () => {
    vi.mocked(getSession).mockRejectedValueOnce(new ApiError("NETWORK", "down"))
    vi.mocked(getSession).mockRejectedValueOnce(new ApiError("NETWORK", "down"))
    vi.mocked(getSession).mockResolvedValue(true)
    render(App)
    expect(await screen.findByText("Can't reach the server")).toBeInTheDocument()
    await fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(await screen.findByRole("link", { name: "Storage" })).toBeInTheDocument()
  })

  it("keeps the page mounted when the session expires", async () => {
    vi.mocked(getSession).mockResolvedValue(true)
    session.isAdmin = true
    await navigate("admin/settings")
    render(App)
    const h1 = await screen.findByRole("heading", { name: "Settings" })
    session.isAdmin = false
    session.loginOpen = true
    await tick()
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Settings" })).toBe(h1)
    expect(screen.getByRole("link", { name: "Storage" })).toBeInTheDocument()
  })

  it("closes the dialog on login and leaves the page untouched", async () => {
    vi.mocked(getSession).mockResolvedValue(true)
    vi.mocked(login).mockImplementationOnce(async () => {})
    session.isAdmin = true
    await navigate("admin/settings")
    render(App)
    const h1 = await screen.findByRole("heading", { name: "Settings" })
    session.isAdmin = false
    session.loginOpen = true
    await tick()
    const dlg = await screen.findByRole("dialog")
    const input = dlg.querySelector("input") as HTMLInputElement
    await fireEvent.input(input, { target: { value: "pw" } })
    await fireEvent.click(screen.getByRole("button", { name: "Log in" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(screen.getByRole("heading", { name: "Settings" })).toBe(h1)
  })

  it("home redirects to a same-origin next, else to storage", async () => {
    let assigned = ""
    vi.mocked(redirect).mockImplementation((u) => { assigned = u })
    try {
      vi.mocked(getSession).mockResolvedValue(true)
      session.isAdmin = true
      for (const [next, want] of [["/files/x", "/files/x"], ["http://evil.example/", "/admin/storage"], [null, "/admin/storage"]] as const) {
        assigned = ""
        history.replaceState(null, "", "/admin" + (next ? "?next=" + encodeURIComponent(next) : ""))
        await navigate("admin" + (next ? "?next=" + encodeURIComponent(next) : ""))
        const r = render(App)
        await waitFor(() => expect(assigned).toBe(want))
        r.unmount()
      }
    } finally {
      vi.mocked(redirect).mockReset()
    }
  })
})

describe("LoginForm", () => {
  afterEach(cleanup)
  it("shows Incorrect password when login is rejected", async () => {
    vi.mocked(login).mockRejectedValueOnce(new ApiError("FORBIDDEN", "Invalid Password", 403))
    render(LoginForm)
    await fireEvent.input(screen.getByLabelText("Password"), { target: { value: "bad" } })
    await fireEvent.click(screen.getByRole("button", { name: "Log in" }))
    expect(await screen.findByText("Incorrect password")).toBeInTheDocument()
  })
})
