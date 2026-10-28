import { writable } from "svelte/store"

export type RouteName =
  | "storage"
  | "workflow-list"
  | "workflow-edit"
  | "workflow-new"
  | "activity"
  | "settings"
  | "about"
  | "setup"
  | "home"

export type Route = { name: RouteName; params: Record<string, string>; query: URLSearchParams }

export type Guard = { isDirty: () => boolean; confirm: () => Promise<boolean> }

const PAGES: Record<string, RouteName> = {
  storage: "storage",
  activity: "activity",
  settings: "settings",
  about: "about",
  setup: "setup",
}

function decodeSpecs(b64: string): Record<string, unknown> | null {
  try {
    // "+" arrives as a space when the link was not percent-encoded
    const bin = atob(b64.replace(/ /g, "+").replace(/-/g, "+").replace(/_/g, "/"))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
    return typeof json === "object" && json !== null && !Array.isArray(json) ? json : null
  } catch {
    return null
  }
}

export function parseRoute(pathname: string, search: string, baseURI: string): Route | null {
  const base = new URL(baseURI).pathname
  if (!pathname.startsWith(base)) return null
  const rest = pathname.slice(base.length).replace(/\/+$/, "")
  const query = new URLSearchParams(search)
  const make = (name: RouteName, params: Record<string, string> = {}): Route => ({ name, params, query })

  const parts = rest.split("/")
  if (parts[0] !== "admin") return null
  if (parts.length === 1) return make("home")
  const [, page, sub, ...extra] = parts
  if (extra.length > 0) return null

  if (page === "workflow") {
    if (sub === undefined) {
      const specs = query.get("specs")
      if (specs === null) return make("workflow-list")
      const decoded = decodeSpecs(specs)
      if (decoded === null) return make("workflow-list")
      const id = decoded.id
      return id !== undefined && id !== null && id !== ""
        ? make("workflow-edit", { id: String(id), specs })
        : make("workflow-new", { specs })
    }
    if (sub === "new") return make("workflow-new")
    try {
      return make("workflow-edit", { id: decodeURIComponent(sub) })
    } catch {
      return null
    }
  }
  if (sub !== undefined) return null
  return page in PAGES ? make(PAGES[page]) : null
}

// Resolves against the document base; yields a root-relative URL under the base.
export function href(path: string): string {
  const u = new URL(path, document.baseURI)
  return u.pathname + u.search + u.hash
}

export const route = writable<Route | null>(null)

const guards = new Set<Guard>()

export function addGuard(g: Guard): () => void {
  guards.add(g)
  return () => {
    guards.delete(g)
  }
}

let lastUrl = ""

function sync() {
  lastUrl = location.pathname + location.search
  route.set(parseRoute(location.pathname, location.search, document.baseURI))
}

async function confirmLeave(): Promise<boolean> {
  for (const g of [...guards]) {
    if (g.isDirty() && !(await g.confirm())) return false
  }
  return true
}

let checking = false

async function onPopState() {
  if (checking) return
  checking = true
  try {
    if (await confirmLeave()) sync()
    else history.pushState(null, "", lastUrl)
  } finally {
    checking = false
  }
}

export async function navigate(path: string, opts: { replace?: boolean } = {}): Promise<boolean> {
  if (!(await confirmLeave())) return false
  const url = href(path)
  if (opts.replace) history.replaceState(null, "", url)
  else history.pushState(null, "", url)
  sync()
  return true
}

export function safeNext(next: string | null, origin: string): string | null {
  if (!next) return null
  try {
    const u = new URL(next, origin)
    return u.origin === new URL(origin).origin ? next : null
  } catch {
    return null
  }
}

if (typeof window !== "undefined") {
  sync()
  window.addEventListener("popstate", () => void onPopState())
  window.addEventListener("beforeunload", (e) => {
    if ([...guards].some((g) => g.isDirty())) {
      e.preventDefault()
      // older browsers only prompt when returnValue is set
      e.returnValue = ""
    }
  })
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as Element | null)?.closest?.("a[data-link]") as HTMLAnchorElement | null
    if (!a || (a.target && a.target !== "_self")) return
    e.preventDefault()
    void navigate(a.getAttribute("href") ?? "")
  })
}
