// Builds public/assets/locales/admin/en.json and _.json from the admin source.
//
//   node scripts/i18n.mjs          rewrite both files
//   node scripts/i18n.mjs --check  exit 1 if they are out of date
//
// Every t("...") literal becomes a key whose English value is the literal. Keys for
// names the server sends (STORAGE., LOGIN_METHOD., FIELD., OPTION., SECTION.) have no
// literal in the source; they are kept from en.json as they are and edited by hand.
// Their keys contain a dot (STORAGE.S3), which a text key never does.
// _.json is the blank template translators copy, as in the main app's locales.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dir = path.join(root, "../public/assets/locales/admin")

export function toKey(text) {
  return text.toUpperCase().replace(/ /g, "_").replace(/[^a-zA-Z0-9\-_*{}?]/g, "").replace(/_+$/, "")
}

function files(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return files(p)
    return /\.(ts|svelte)$/.test(e.name) && !/\.test\.ts$|harness\.svelte$/.test(e.name) ? [p] : []
  })
}

const LITERAL = /(?<![\w$.])t\(\s*(?:"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`([^`$\\]*)`)/g
const ANY_CALL = /(?<![\w$.])t\(/g

export function extract(srcDir = path.join(root, "src")) {
  const found = new Map()
  const errors = []
  for (const f of files(srcDir)) {
    if (f.endsWith(path.join("lib", "i18n.ts"))) continue
    const code = fs.readFileSync(f, "utf8")
    const rel = path.relative(root, f)
    const literals = new Set()
    for (const m of code.matchAll(LITERAL)) {
      literals.add(m.index)
      const text =
        m[1] !== undefined
          ? JSON.parse(`"${m[1]}"`)
          : m[2] !== undefined
            ? JSON.parse(`"${m[2].replace(/\\'/g, "'").replace(/"/g, '\\"')}"`)
            : m[3]
      const key = toKey(text)
      const prev = found.get(key)
      if (prev && prev.text !== text) errors.push(`${rel}: "${text}" and "${prev.text}" (${prev.file}) share the key ${key}`)
      else if (!prev) found.set(key, { text, file: rel })
    }
    for (const m of code.matchAll(ANY_CALL)) {
      if (!literals.has(m.index)) {
        const line = code.slice(0, m.index).split("\n").length
        errors.push(`${rel}:${line}: t() needs a string literal so the key can be found`)
      }
    }
  }
  return { found, errors }
}

const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]))
const write = (o) => JSON.stringify(o, null, 4) + "\n"

export function build() {
  const enPath = path.join(dir, "en.json")
  const current = fs.existsSync(enPath) ? JSON.parse(fs.readFileSync(enPath, "utf8")) : {}
  const { found, errors } = extract()
  const en = {}
  for (const [k, v] of Object.entries(current)) if (k.includes(".")) en[k] = v
  for (const [k, { text, file }] of found) {
    if (k in en) errors.push(`${file}: "${text}" clashes with the name key ${k}`)
    en[k] = text
  }
  const blank = Object.fromEntries(Object.keys(en).map((k) => [k, ""]))
  return { en: write(sorted(en)), blank: write(sorted(blank)), errors }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { en, blank, errors } = build()
  if (errors.length) {
    console.error(errors.join("\n"))
    process.exit(1)
  }
  const targets = [["en.json", en], ["_.json", blank]]
  if (process.argv.includes("--check")) {
    const stale = targets.filter(([f, s]) => !fs.existsSync(path.join(dir, f)) || fs.readFileSync(path.join(dir, f), "utf8") !== s)
    if (stale.length) {
      console.error(`out of date: ${stale.map(([f]) => f).join(", ")}; run npm run i18n`)
      process.exit(1)
    }
  } else {
    fs.mkdirSync(dir, { recursive: true })
    for (const [f, s] of targets) fs.writeFileSync(path.join(dir, f), s)
  }
}
