import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/svelte"
import { tick } from "svelte"

vi.mock("$lib/api/endpoints", () => ({
  getSession: vi.fn(async () => true),
  login: vi.fn(async () => {}),
  getRelease: vi.fn(async () => ({ html: "", version: "v1.2" })),
}))

import App from "../../App.svelte"
import { session } from "$lib/session.svelte"
import { navigate } from "$lib/router"
import { getSession } from "$lib/api/endpoints"

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
})
