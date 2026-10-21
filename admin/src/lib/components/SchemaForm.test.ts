import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte"
import Harness from "./SchemaForm.harness.svelte"
import type { Schema } from "$lib/types"

const el = (type: string, label: string, extra: Record<string, unknown> = {}) => ({
  label, type, default: null, value: null, readonly: false, required: false, ...extra,
})

const sftp: Schema = {
  hostname: el("text", "Hostname", { value: "h" }),
  advanced: el("enable", "Advanced", { target: ["sftp_port"], value: false }),
  port: el("number", "Port", { id: "sftp_port", value: 22 }),
}

describe("SchemaForm", () => {
  afterEach(cleanup)

  it("hides enable targets until toggled", async () => {
    render(Harness, { schema: sftp, values: { hostname: "h", advanced: false, port: 22 } })
    expect(screen.queryByLabelText("Port")).toBeNull()
    await fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    expect(screen.getByLabelText("Port")).toBeVisible()
  })

  it("number empty binds null", async () => {
    const values = { port: 22 }
    render(Harness, { schema: { port: el("number", "Port", { value: 22 }) }, values })
    await fireEvent.input(screen.getByLabelText("Port"), { target: { value: "" } })
    expect(screen.getByTestId("out").textContent).toBe(JSON.stringify({ port: null }))
  })

  it("unknown type falls back to text input", () => {
    render(Harness, { schema: { dir: el("directory", "Dir", { value: "/x" }) }, values: { dir: "/x" } })
    expect(screen.getByRole("textbox", { name: "Dir" })).toHaveValue("/x")
  })

  it("names inputs by dot-path and skips hidden keys", () => {
    render(Harness, {
      schema: { a: { b: el("text", "B", { value: "1" }) }, skip: el("text", "Skip", { value: "x" }) },
      values: { a: { b: "1" }, skip: "x" },
      hidden: ["skip"],
      prefix: "p.",
    })
    expect(screen.getByLabelText("B")).toHaveAttribute("name", "p.a.b")
    expect(screen.queryByLabelText("Skip")).toBeNull()
  })

  const nested: Schema = { sec: { name: el("text", "Name", { value: "x" }) } }

  it("nested edits reach the root when the section object is missing", async () => {
    render(Harness, { schema: nested, values: {} })
    await fireEvent.input(screen.getByLabelText("Name"), { target: { value: "typed" } })
    expect(screen.getByTestId("out").textContent).toBe(JSON.stringify({ sec: { name: "typed" } }))
  })

  it("nested edits reach the root when values are pre-populated", async () => {
    render(Harness, { schema: nested, values: { sec: { name: "x" } } })
    await fireEvent.input(screen.getByLabelText("Name"), { target: { value: "typed" } })
    expect(screen.getByTestId("out").textContent).toBe(JSON.stringify({ sec: { name: "typed" } }))
  })
})
