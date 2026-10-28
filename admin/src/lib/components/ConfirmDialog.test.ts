import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte"
import ConfirmDialog from "./ConfirmDialog.svelte"
import { confirm } from "$lib/confirm.svelte"

describe("ConfirmDialog", () => {
  afterEach(cleanup)

  it("resolves true on confirm and false on cancel", async () => {
    render(ConfirmDialog)
    const yes = confirm({ title: "Sure?", body: "Really", confirmLabel: "Do it" })
    await fireEvent.click(await screen.findByRole("button", { name: "Do it" }))
    expect(await yes).toBe(true)

    const no = confirm({ title: "Sure?", body: "Really", confirmLabel: "Do it" })
    await fireEvent.click(await screen.findByRole("button", { name: "Cancel" }))
    expect(await no).toBe(false)
  })
})
