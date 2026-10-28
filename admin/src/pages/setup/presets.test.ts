import { describe, expect, it } from "vitest"
import { PRESETS, applyPresetInputs, healthChecks, presetAvailable } from "./presets"

const byName = (name: string) => PRESETS.find((p) => p.name === name)!

describe("setup presets", () => {
  it("PRESETS count matches legacy", () => {
    expect(PRESETS).toHaveLength(6)
  })

  it("preset placeholders are replaced and quotes escaped", () => {
    const p = byName("SFTP Storage - Use existing credentials")
    const out = applyPresetInputs(p, { sftp_hostname: 'h"x' })
    expect(JSON.parse(out.attribute_mapping.params)).toEqual({
      sftp: { type: "sftp", hostname: 'h"x', username: "{{ .user }}", password: "{{ .password }}" },
    })
    expect(out.attribute_mapping.related_backend).toBe("sftp")
    expect(out.connections).toEqual([{ type: "sftp", label: "sftp" }])
  })

  it.each(["ab\\cd", "trail\\", "a\nb", 'a\\"b', 'q"uote'])("escaped value round-trips through JSON: %j", (v) => {
    const out = applyPresetInputs(byName("S3 Storage - Multiple users"), { access_key_id: v, secret_access_key: v })
    expect(JSON.parse(out.attribute_mapping.params).s3.secret_access_key).toBe(v)
  })

  it("replaces placeholders in the identity provider params too", () => {
    const out = applyPresetInputs(byName("FTP Storage - WordPress Users"), {
      ftp_hostname: "h", ftp_username: "u", ftp_password: "p", wordpress_url: "https://w",
    })
    expect(JSON.parse(out.identity_provider.params)).toEqual({ url: "https://w" })
    expect(out.identity_provider.type).toBe("wordpress")
  })

  it("local preset uses admin password", () => {
    const out = applyPresetInputs(byName("Local Storage - Local Users"), {}, "pw")
    expect(out.attribute_mapping.params).toContain('"pw"')
    expect(JSON.parse(out.attribute_mapping.params).local.password).toBe("pw")
  })

  it("does not mutate the preset and treats $ in values literally", () => {
    const p = byName("S3 Storage - Multiple users")
    const before = JSON.stringify(p)
    const out = applyPresetInputs(p, { access_key_id: "a$&b", secret_access_key: "s" })
    expect(JSON.parse(out.attribute_mapping.params).s3.access_key_id).toBe("a$&b")
    expect(JSON.stringify(p)).toBe(before)
  })

  it("presetAvailable checks storage and auth plugins", () => {
    const p = byName("S3 Storage - Use your AWS credentials")
    expect(presetAvailable(p, { s3: {} }, { passthrough: {} })).toBe(true)
    expect(presetAvailable(p, { s3: {} }, {})).toBe(false)
    expect(presetAvailable(p, {}, { passthrough: {} })).toBe(false)
  })

  it("health checks", () => {
    const checks = healthChecks({ protocol: "http:", user: "root", license: "agpl", connections: 0 })
    expect(checks.map((c) => c.pass)).toEqual([false, false, false, false, false])
    expect(checks[1].nameFailure).toBe("Running as root")
    const ok = healthChecks({ protocol: "https:", user: "bob", license: "pro", connections: 2 })
    expect(ok[1].nameSuccess).toBe("Running as non root user: 'bob'")
    expect(ok[0].pass && ok[1].pass && ok[3].pass && ok[4].pass).toBe(true)
    expect(ok[2].nameFailure).toBe("Want to try something different?")
    expect(checks[2].nameFailure).toBe("Almost there!")
  })
})
