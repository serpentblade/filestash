import { describe, expect, it } from "vitest"
import { methodChangeWarning, methodVariables } from "./method"
import { loadStorage } from "$lib/config/storage"
import type { Schema } from "$lib/types"

const el = (type: string, label: string, extra: Record<string, unknown> = {}) => ({
  label, type, default: null, value: null, readonly: false, required: false, ...extra,
})

const htpasswd: Schema = {
  banner: el("hidden", "banner", {
    description: "The plugin exposes 2 variables: {{ .user }} and {{ .password }} which can be used in the attribute mapping",
  }),
  type: el("hidden", "type", { value: "htpasswd" }),
  users: el("long_text", "users", { description: "one per line" }),
}

describe("methodVariables", () => {
  it("finds tokens in htpasswd banner", () => {
    expect(methodVariables(htpasswd)).toEqual(["{{ .user }}", "{{ .password }}"])
  })

  it("reads descriptions and placeholders, de-duplicated", () => {
    const spec: Schema = {
      a: el("text", "a", { description: "use {{.mail}} here", placeholder: "{{ .mail }}" }),
      sub: { b: el("text", "b", { description: "or {{ .group }}" }) },
    }
    expect(methodVariables(spec)).toEqual(["{{ .mail }}", "{{ .group }}"])
  })

  it("falls back to user and password", () => {
    expect(methodVariables(undefined)).toEqual(["{{ .user }}", "{{ .password }}"])
    expect(methodVariables({ a: el("text", "a") })).toEqual(["{{ .user }}", "{{ .password }}"])
  })
})

const state = (method: string, related: string) =>
  loadStorage([{ type: "s3", label: "s3" }, { type: "sftp", label: "sftp" }], {
    identity_provider: { type: method, params: "{}" },
    attribute_mapping: { related_backend: related, params: "{}" },
  })

describe("methodChangeWarning", () => {
  it("warning lists sign-in storages on switch", () => {
    const w = methodChangeWarning(state("htpasswd", "s3"), "ldap")!
    expect(w).toContain("s3")
    expect(w).toContain("LDAP")
    expect(w).not.toContain("sftp")
  })

  it("warning for none mentions removal", () => {
    expect(methodChangeWarning(state("htpasswd", "s3"), null)).toContain("removed")
  })

  it("is null when the method is unchanged or nothing signs in", () => {
    expect(methodChangeWarning(state("htpasswd", "s3"), "htpasswd")).toBeNull()
    expect(methodChangeWarning(state("htpasswd", ""), "ldap")).toBeNull()
    expect(methodChangeWarning(state("htpasswd", ""), null)).toBeNull()
  })

  it("switching away from local says the user list will be cleared", () => {
    const cleared = "The local user list will be cleared."
    expect(methodChangeWarning(state("local", "s3"), "ldap")).toBe(`s3 will now sign in with LDAP. ${cleared}`)
    expect(methodChangeWarning(state("local", "s3"), null)).toMatch(new RegExp(`removed\\. ${cleared}$`))
    expect(methodChangeWarning(state("local", ""), "htpasswd")).toBe(cleared)
    expect(methodChangeWarning(state("local", ""), "local")).toBeNull()
    expect(methodChangeWarning(state("htpasswd", "s3"), "local")).not.toContain(cleared)
  })
})
