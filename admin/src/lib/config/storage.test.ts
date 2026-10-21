import { describe, expect, it } from "vitest"
import {
  duplicateLabels,
  loadStorage,
  mergeIdentity,
  newKey,
  nextLabel,
  parseJSONObject,
  saveStorage,
  setMethod,
  splitRelated,
  usesSignIn,
  validateLabel,
} from "./storage"
import type { Connection, Middleware, StorageEntry, StorageState } from "./storage"

const mw = (
  type: string | null,
  related: string,
  params: unknown = {},
  idParams: unknown = {},
): Middleware => ({
  identity_provider: { type, params: typeof idParams === "string" ? idParams : JSON.stringify(idParams) },
  attribute_mapping: {
    related_backend: related,
    params: typeof params === "string" ? params : JSON.stringify(params),
  },
})

const entry = (label: string, over: Partial<StorageEntry> = {}): StorageEntry => ({
  key: label,
  original: null,
  type: "s3",
  label,
  mode: "own",
  details: {},
  ...over,
})

const deepFreeze = <T>(o: T): T => {
  if (typeof o === "object" && o !== null) {
    Object.values(o).forEach(deepFreeze)
    Object.freeze(o)
  }
  return o
}

const update = (state: StorageState, i: number, patch: Partial<StorageEntry>): StorageState => ({
  ...state,
  entries: state.entries.map((e, j) => (j === i ? { ...e, ...patch } : e)),
})

describe("storage model", () => {
  it("parseJSONObject and splitRelated tolerate junk", () => {
    expect(parseJSONObject("")).toEqual({})
    expect(parseJSONObject("null")).toEqual({})
    expect(parseJSONObject("[1]")).toEqual({})
    expect(parseJSONObject("nope")).toEqual({})
    expect(parseJSONObject(null)).toEqual({})
    expect(parseJSONObject(undefined)).toEqual({})
    expect(parseJSONObject({ a: 1 })).toEqual({})
    expect(parseJSONObject('{"a":1}')).toEqual({ a: 1 })
    expect(splitRelated(" a , ,b,")).toEqual(["a", "b"])
  })

  it("loads mode from method + related_backend", () => {
    const conns: Connection[] = [
      { type: "s3", label: "s3" },
      { type: "sftp", label: "Company files" },
      { type: "ftp", label: "ftp" },
    ]
    const st = loadStorage(conns, mw("htpasswd", "s3, Company files"))
    expect(st.entries.map((e) => e.mode)).toEqual(["signin", "signin", "own"])
    expect(st.entries.map((e) => e.key)).toEqual(["c0", "c1", "c2"])
    expect(st.method).toBe("htpasswd")
  })

  it("matching trims spaces and is case-sensitive", () => {
    const conns: Connection[] = [
      { type: "sftp", label: "Company files" },
      { type: "s3", label: "s3x" },
    ]
    const st = loadStorage(conns, mw("htpasswd", "s3 ,  Company files,S3x"))
    expect(st.entries.map((e) => e.mode)).toEqual(["signin", "own"])
  })

  it("method none means every storage is own and the leftovers are listed", () => {
    const st = loadStorage(
      [{ type: "s3", label: "s3" }],
      mw("", "s3", { s3: { type: "s3", access_key_id: "k" } }),
    )
    expect(st.method).toBeNull()
    expect(st.entries.map((e) => e.mode)).toEqual(["own"])
    expect(st.entries[0].details).toEqual({})
    expect(st.leftovers.relatedLabels).toEqual(["s3"])
    expect(st.leftovers.paramKeys).toEqual(["s3"])
    const nul = loadStorage([{ type: "s3", label: "s3" }], mw(null, "s3"))
    expect(nul.method).toBeNull()
    expect(nul.entries[0].mode).toBe("own")
  })

  it("corrupt params strings load as empty", () => {
    const conns: Connection[] = [{ type: "s3", label: "s3" }]
    const m: Middleware = {
      identity_provider: { type: "htpasswd", params: "" },
      attribute_mapping: { related_backend: "s3", params: "not json" },
    }
    let st: StorageState | undefined
    expect(() => (st = loadStorage(conns, m))).not.toThrow()
    expect(st!.methodParams).toEqual({})
    expect(st!.entries[0].details).toEqual({})
    const nulls = { identity_provider: { type: "htpasswd", params: null }, attribute_mapping: { related_backend: "s3", params: null } }
    expect(() => loadStorage(conns, nulls as unknown as Middleware)).not.toThrow()
  })

  it("loads details without the type key and method params", () => {
    const st = loadStorage(
      [{ type: "s3", label: "s3" }],
      mw("htpasswd", "s3", { s3: { type: "s3", access_key_id: "{{ .user }}" } }, { users: "u" }),
    )
    expect(st.entries[0].details).toEqual({ access_key_id: "{{ .user }}" })
    expect(st.methodParams).toEqual({ users: "u" })
    expect(st.leftovers).toEqual({ relatedLabels: [], paramKeys: [], paramValues: {} })
  })

  it("round-trips pinned connection fields", () => {
    const conn: Connection = { type: "sftp", label: "x", hostname: "h", path: "/data" }
    const out = saveStorage(loadStorage([conn], mw("htpasswd", "")))
    expect(out.connections[0]).toEqual({ type: "sftp", label: "x", hostname: "h", path: "/data" })
  })

  it("saves related_backend, params and identity_provider", () => {
    const st = loadStorage(
      [
        { type: "s3", label: "s3" },
        { type: "ftp", label: "ftp" },
        { type: "sftp", label: "sftp" },
      ],
      mw("htpasswd", "sftp,s3", { s3: { type: "s3", a: "1" }, sftp: { type: "sftp", b: "2" } }, { users: "u" }),
    )
    const out = saveStorage(st)
    expect(out.middleware.attribute_mapping.related_backend).toBe("s3, sftp")
    expect(JSON.parse(out.middleware.attribute_mapping.params)).toEqual({
      s3: { type: "s3", a: "1" },
      sftp: { type: "sftp", b: "2" },
    })
    expect(out.middleware.identity_provider).toEqual({ type: "htpasswd", params: '{"users":"u"}' })
  })

  it("rename updates connection, related_backend and params key together", () => {
    const st = loadStorage(
      [{ type: "s3", label: "s3", bucket: "b" }],
      mw("htpasswd", "s3", { s3: { type: "s3", access_key_id: "k" } }),
    )
    const out = saveStorage(update(st, 0, { label: "Company S3" }))
    expect(out.connections).toEqual([{ type: "s3", label: "Company S3", bucket: "b" }])
    expect(out.middleware.attribute_mapping.related_backend).toBe("Company S3")
    const params = JSON.parse(out.middleware.attribute_mapping.params)
    expect(params).toHaveProperty(["Company S3"])
    expect(params).not.toHaveProperty("s3")
    expect(params["Company S3"]).toEqual({ type: "s3", access_key_id: "k" })
  })

  it("switching to own drops params entry on save", () => {
    const st = loadStorage(
      [
        { type: "s3", label: "s3" },
        { type: "ftp", label: "ftp" },
      ],
      mw("htpasswd", "s3, ftp", { s3: { type: "s3", k: "v" }, ftp: { type: "ftp" } }),
    )
    const out = saveStorage(update(st, 0, { mode: "own" }))
    expect(splitRelated(out.middleware.attribute_mapping.related_backend)).not.toContain("s3")
    expect(JSON.parse(out.middleware.attribute_mapping.params)).not.toHaveProperty("s3")
    expect(out.middleware.attribute_mapping.related_backend).toBe("ftp")
  })

  it("delete removes connection, related label and params key", () => {
    const st = loadStorage(
      [
        { type: "s3", label: "s3" },
        { type: "ftp", label: "ftp" },
      ],
      mw("htpasswd", "s3, ftp", { s3: { type: "s3" }, ftp: { type: "ftp" } }),
    )
    const out = saveStorage({ ...st, entries: st.entries.filter((e) => e.label !== "s3") })
    expect(out.connections).toEqual([{ type: "ftp", label: "ftp" }])
    expect(out.middleware.attribute_mapping.related_backend).toBe("ftp")
    expect(JSON.parse(out.middleware.attribute_mapping.params)).toEqual({ ftp: { type: "ftp" } })
  })

  it("choosing none clears related_backend and params", () => {
    const st = loadStorage(
      [{ type: "s3", label: "s3" }],
      mw("htpasswd", "s3, ghost", { s3: { type: "s3", k: "v" }, ghost: { type: "ftp" } }, { users: "u" }),
    )
    const none = setMethod(st, null, {})
    expect(none.entries[0]).toMatchObject({ mode: "own", details: {} })
    expect(st.entries[0].mode).toBe("signin")
    const out = saveStorage(none)
    expect(out.middleware.attribute_mapping.related_backend).toBe("")
    expect(out.middleware.attribute_mapping.params).toBe("{}")
    expect(out.middleware.identity_provider).toEqual({ type: "", params: "{}" })
  })

  it("leftovers are preserved unless removeLeftovers", () => {
    const st = loadStorage(
      [{ type: "s3", label: "s3" }],
      mw("htpasswd", "s3, ghost", { s3: { type: "s3" }, ghost: { type: "ftp" } }),
    )
    expect(st.leftovers).toEqual({ relatedLabels: ["ghost"], paramKeys: ["ghost"], paramValues: { ghost: { type: "ftp" } } })
    const kept = saveStorage(st)
    expect(splitRelated(kept.middleware.attribute_mapping.related_backend)).toEqual(["s3", "ghost"])
    expect(JSON.parse(kept.middleware.attribute_mapping.params)).toEqual({ s3: { type: "s3" }, ghost: { type: "ftp" } })
    const gone = saveStorage(st, { removeLeftovers: true })
    expect(gone.middleware.attribute_mapping.related_backend).toBe("s3")
    expect(JSON.parse(gone.middleware.attribute_mapping.params)).toEqual({ s3: { type: "s3" } })
  })

  it("leftovers never re-bind a storage that is not in sign-in mode", () => {
    // Loaded with method none: s3's related label and params are leftovers.
    const st = loadStorage([{ type: "s3", label: "s3" }], mw("", "s3, ghost", { s3: { type: "s3", k: "v" } }))
    const out = saveStorage(setMethod(st, "htpasswd", {}))
    expect(out.middleware.attribute_mapping.related_backend).toBe("ghost")
    expect(out.middleware.attribute_mapping.params).toBe("{}")
    // A new own-mode storage that takes a leftover's name doesn't inherit it.
    const st2 = loadStorage([], mw("htpasswd", "ghost", { ghost: { type: "ftp" } }))
    const out2 = saveStorage({ ...st2, entries: [entry("ghost")] })
    expect(out2.middleware.attribute_mapping.related_backend).toBe("")
    expect(out2.middleware.attribute_mapping.params).toBe("{}")
  })

  it("leftovers from a method-none load stay gone after rename or delete", () => {
    const load = () =>
      loadStorage([{ type: "s3", label: "s3" }], mw("", "s3", { s3: { type: "s3", secret: "creds" } }))
    const check = (st: StorageState) => {
      const out = saveStorage(setMethod(st, "htpasswd", {}))
      expect(splitRelated(out.middleware.attribute_mapping.related_backend)).not.toContain("s3")
      expect(JSON.parse(out.middleware.attribute_mapping.params)).not.toHaveProperty("s3")
    }
    check(update(load(), 0, { label: "Company" }))
    const st = load()
    check({ ...st, entries: [] })
  })

  it("leftovers matching a loaded label only once trimmed stay gone after rename", () => {
    const st = loadStorage([{ type: "s3", label: " s3 " }], mw("", "s3", { s3: { type: "s3", secret: "creds" } }))
    expect(st.leftovers.relatedLabels).toEqual(["s3"])
    const out = saveStorage(setMethod(update(st, 0, { label: "Company" }), "htpasswd", {}))
    expect(splitRelated(out.middleware.attribute_mapping.related_backend)).not.toContain("s3")
    expect(JSON.parse(out.middleware.attribute_mapping.params)).not.toHaveProperty("s3")
  })

  it("mergeIdentity keeps the server's identity provider when the save is not the login method dialog", () => {
    const fresh = { type: "local", params: JSON.stringify({ users: [{ name: "bob", mfa: "x" }], notify: "on" }) }
    expect(mergeIdentity(fresh, null)).toEqual(fresh)
  })

  it("mergeIdentity overlays only edited keys for the same method", () => {
    const fresh = { type: "local", params: JSON.stringify({ users: [{ name: "bob" }], notify: "on", drop: "me" }) }
    const out = mergeIdentity(fresh, { method: "local", params: { notify: "off", users: "stale" }, edited: { notify: "off", drop: null } })
    expect(out.type).toBe("local")
    expect(JSON.parse(out.params)).toEqual({ users: [{ name: "bob" }], notify: "off" })
  })

  it("mergeIdentity writes the dialog's params for a new method, and clears for None", () => {
    const fresh = { type: "local", params: JSON.stringify({ users: [] }) }
    expect(mergeIdentity(fresh, { method: "ldap", params: { hostname: "h" }, edited: null })).toEqual({
      type: "ldap",
      params: JSON.stringify({ hostname: "h" }),
    })
    // edited is ignored when the server's method differs from the one being saved
    expect(mergeIdentity(fresh, { method: "ldap", params: { hostname: "h" }, edited: { hostname: "h" } }).params).toBe(
      JSON.stringify({ hostname: "h" }),
    )
    expect(mergeIdentity(fresh, { method: null, params: {}, edited: null })).toEqual({ type: "", params: "{}" })
  })

  it("labels are saved trimmed", () => {
    const st = loadStorage([], mw("htpasswd", ""))
    const out = saveStorage({ ...st, entries: [entry(" ok ", { mode: "signin", details: { a: "1" } })] })
    expect(out.connections[0].label).toBe("ok")
    expect(out.middleware.attribute_mapping.related_backend).toBe("ok")
    expect(JSON.parse(out.middleware.attribute_mapping.params)).toEqual({ ok: { type: "s3", a: "1" } })
  })

  it("new entries save as plain connections", () => {
    const st = loadStorage([], mw("htpasswd", ""))
    const out = saveStorage({ ...st, entries: [entry("mine", { type: "ftp", mode: "signin", details: { hostname: "h" } })] })
    expect(out.connections).toEqual([{ type: "ftp", label: "mine" }])
    expect(JSON.parse(out.middleware.attribute_mapping.params)).toEqual({ mine: { type: "ftp", hostname: "h" } })
  })

  it("validateLabel", () => {
    expect(validateLabel("", [])).not.toBeNull()
    expect(validateLabel("   ", [])).not.toBeNull()
    expect(validateLabel("a,b", [])).toMatch(/comma/i)
    expect(validateLabel("s3", ["s3"])).not.toBeNull()
    expect(validateLabel(" ok ", [])).toBeNull()
  })

  it("duplicateLabels finds repeated labels", () => {
    expect(duplicateLabels([entry("s3"), entry("s3"), entry("ftp")])).toEqual(new Set(["s3"]))
    expect(duplicateLabels([entry("s3"), entry("ftp")])).toEqual(new Set())
    expect(duplicateLabels([entry("s3"), entry(" s3 ")])).toEqual(new Set(["s3"]))
  })

  it("nextLabel de-duplicates", () => {
    expect(nextLabel("s3", [entry("s3"), entry("s3 2")])).toBe("s3 3")
    expect(nextLabel("ftp", [entry("s3")])).toBe("ftp")
    expect(nextLabel("s3", [entry(" s3 ")])).toBe("s3 2")
  })

  it("newKey hands out distinct new- keys", () => {
    const a = newKey()
    const b = newKey()
    expect(a).toMatch(/^new-\d+$/)
    expect(b).not.toBe(a)
  })

  it("usesSignIn lists sign-in entries", () => {
    const st = loadStorage(
      [
        { type: "s3", label: "s3" },
        { type: "ftp", label: "ftp" },
      ],
      mw("htpasswd", "ftp"),
    )
    expect(usesSignIn(st).map((e) => e.label)).toEqual(["ftp"])
  })

  it("does not mutate input", () => {
    const conns = deepFreeze<Connection[]>([
      { type: "s3", label: "s3", nested: { a: 1 } },
      { type: "ftp", label: "ftp" },
    ])
    const m = deepFreeze(mw("htpasswd", "s3, ghost", { s3: { type: "s3", k: "v" }, ghost: { type: "ftp" } }, { users: "u" }))
    const st = deepFreeze(loadStorage(conns, m))
    expect(() => saveStorage(st)).not.toThrow()
    expect(() => saveStorage(st, { removeLeftovers: true })).not.toThrow()
    expect(() => setMethod(st, null, {})).not.toThrow()
    const out = saveStorage(update(st, 0, { label: "renamed" }))
    expect(conns[0].label).toBe("s3")
    expect(out.connections[0]).not.toBe(conns[0])
  })
})
