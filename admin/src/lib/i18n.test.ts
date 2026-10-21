import { afterEach, describe, expect, it, vi } from "vitest"
import { execFileSync } from "node:child_process"
import { fieldLabel, format, loadLanguage, methodName, optionLabel, sectionLabel, setLanguage, storageName, t, toKey } from "./i18n"

const json = (body: unknown, ok = true) =>
  ({ ok, headers: new Headers({ "content-type": "application/json" }), json: async () => body }) as Response

describe("i18n", () => {
  afterEach(() => setLanguage({}))

  it("keys follow the main app's format", () => {
    expect(toKey("Delete storage?")).toBe("DELETE_STORAGE?")
    expect(toKey("{{VALUE}} will now sign in.")).toBe("{{VALUE}}_WILL_NOW_SIGN_IN")
  })

  it("falls back to the text, and fills placeholders", () => {
    expect(t("Not a key anywhere")).toBe("Not a key anywhere")
    expect(t("Delete {{VALUE}}?", "s3")).toBe("Delete s3?")
    expect(t("{{A}} and {{B}}", { A: 1, B: "two" })).toBe("1 and two")
  })

  it("uses the language file, keeping the case of the source text", () => {
    setLanguage({ SAVE: "enregistrer", NOT_A_KEY: "pas une clé" })
    expect(t("Save")).toBe("Enregistrer")
    expect(t("not a key")).toBe("pas une clé")
  })

  it("names use en.json, then the old format rule", () => {
    expect(storageName("s3")).toBe("S3")
    expect(storageName("gdrive")).toBe("Google Drive")
    expect(methodName("local")).toBe("Local users")
    expect(storageName("local")).toBe("Local")
    expect(methodName(null)).toBe("None")
    expect(fieldLabel("access_key_id")).toBe("Access Key ID")
    expect(optionLabel("username_and_password")).toBe("Username and password")
    expect(sectionLabel("general")).toBe("General")
    expect(fieldLabel("brand_new_field")).toBe("Brand New Field")
    expect(format("a__b")).toBe("A  B")
  })

  it("a translated name wins over English", () => {
    setLanguage({ "FIELD.ACCESS_KEY_ID": "ID de clé d'accès" })
    expect(fieldLabel("access_key_id")).toBe("ID de clé d'accès")
  })

  it("loads the region file, then the base language, and stays English when neither exists", async () => {
    const fetcher = vi.fn(async (url: string) => (url.endsWith("/fr.json") ? json({ SAVE: "enregistrer", EMPTY: "" }) : json(null, false)))
    await loadLanguage("fr-CA", fetcher)
    expect(fetcher.mock.calls.map(([u]) => u.split("/").pop())).toEqual(["fr-CA.json", "fr.json"])
    expect(t("Save")).toBe("Enregistrer")

    await loadLanguage("xx", async () => json(null, false))
    expect(t("Save")).toBe("Save")
  })

  it("English never fetches, and a failing fetch is ignored", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("offline")
    })
    await loadLanguage("en-US", fetcher)
    expect(fetcher).not.toHaveBeenCalled()
    await loadLanguage("de", fetcher)
    expect(t("Save")).toBe("Save")
  })

  it("en.json and _.json match the source (run npm run i18n)", () => {
    expect(() => execFileSync("node", ["scripts/i18n.mjs", "--check"], { stdio: "pipe" })).not.toThrow()
  })
})
