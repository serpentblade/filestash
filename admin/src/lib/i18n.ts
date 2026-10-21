// Translations for the admin console.
//
// Language files live in public/assets/locales/admin/<lang>.json and use the same
// key format as the main app's locales: the English text upper-cased, spaces as "_".
// en.json holds every key and is built into the bundle; other languages are fetched
// at startup. A missing key falls back to English, then to the text itself.
//
// Names that come from the server (storage types, login methods, form fields and
// options) have no English text in the code, so they use dotted keys, e.g.
// STORAGE.S3, LOGIN_METHOD.LOCAL, FIELD.ACCESS_KEY_ID, OPTION.GRID, SECTION.GENERAL.
// A text key never contains a dot, so the two kinds cannot collide.
// Without an entry they are shown through format(): "access_key_id" → "Access Key Id".

import en from "../../../public/assets/locales/admin/en.json"

type Dict = Record<string, string>
type Vars = string | number | Record<string, string | number>

const EN: Dict = en
let lang: Dict = {}

export function toKey(text: string): string {
  return text
    .toUpperCase()
    .replace(/ /g, "_")
    .replace(/[^a-zA-Z0-9\-_*{}?]/g, "")
    .replace(/_+$/, "")
}

function fill(s: string, vars?: Vars): string {
  if (vars === undefined) return s
  if (typeof vars !== "object") return s.replace("{{VALUE}}", String(vars))
  return s.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

// a translation keeps the case of the text's first letter, as the main app does
function matchCase(translated: string, source: string): string {
  const first = source[0]
  if (!first || !translated) return translated
  if (first === first.toLowerCase() && first !== first.toUpperCase()) {
    return translated[0].toLowerCase() + translated.slice(1)
  }
  return translated[0].toUpperCase() + translated.slice(1)
}

function lookup(key: string): string | undefined {
  return lang[key] || EN[key] || undefined
}

// Fixed text. The literal is the English source; scripts/i18n.mjs reads it to build en.json.
// Placeholders: {{VALUE}} with a single value, or {{NAME}} with an object.
export function t(text: string, vars?: Vars): string {
  const key = toKey(text)
  const own = lang[key]
  const s = own ? matchCase(own, EN[key] || text) : EN[key] || text
  return fill(s, vars)
}

// The old admin's rule for names without an entry: split on "_", capitalise each word.
export function format(name: string): string {
  return name
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
}

const named = (prefix: string) => (name: string) => {
  if (!name) return name
  return lookup(prefix + toKey(name)) ?? format(name)
}

export const storageName = named("STORAGE.")
export const fieldLabel = named("FIELD.")
export const optionLabel = named("OPTION.")
export const sectionLabel = named("SECTION.")
export const methodName = (m: string | null) => (m === null ? t("None") : named("LOGIN_METHOD.")(m))

const SUPPORTED = /^[a-z]{2,3}(-[A-Z]{2})?$/

// locales/admin/ next to the bundle: assets/<version>/admin/index.js → assets/<version>/locales/admin/
function localeDir(): string {
  const script = document.querySelector<HTMLScriptElement>('script[src*="/admin/index.js"]')
  return new URL("../locales/admin/", script?.src || document.baseURI).href
}

// The browser's language, then its base language; English needs no fetch.
export async function loadLanguage(
  language = navigator.language,
  fetcher: (url: string) => Promise<Response> = (u) => fetch(u),
): Promise<void> {
  lang = {}
  const base = language.split("-")[0]
  if (base === "en") return
  const tries = [...new Set([language, base])].filter((l) => SUPPORTED.test(l))
  for (const l of tries) {
    try {
      const res = await fetcher(`${localeDir()}${l}.json`)
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) continue
      const data = await res.json()
      if (data && typeof data === "object") {
        lang = Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v === "string" && v !== "")) as Dict
        document.documentElement.lang = l
        return
      }
    } catch {
      // a missing or broken file leaves the console in English
    }
  }
}

// tests only
export function setLanguage(dict: Dict) {
  lang = { ...dict }
}
