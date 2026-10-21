# Admin Console Rebuild (Svelte + shadcn-svelte) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Filestash's admin console with a Svelte 5 + shadcn-svelte app that's a drop-in for the existing Go backend, with a redesigned Storage page and explicit Save everywhere.

**Architecture:** A standalone Vite SPA lives in `admin/`. It builds into `public/assets/admin/` (committed), and a rewritten `public/index.backoffice.html` Go template loads it. All config logic (form-schema ↔ values, the storage ↔ `connections`/`middleware` mapping, and save merging) is plain TypeScript with unit tests. Svelte components stay thin over it.

**Tech Stack:** Svelte 5 (runes), Vite, TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), shadcn-svelte (current Svelte 5 release, via its CLI), Vitest + jsdom + @testing-library/svelte, `bcryptjs`, `marked`.

**Spec:** `docs/superpowers/specs/2026-10-20-admin-svelte-rebuild-design.md`. Read it first; this plan argues from it.

## Global Constraints

- No changes to Go code, `/admin/api/*`, `/api/*`, the `config.json` format, or the end-user login page.
- Every request to the server sends the header `X-Requested-With: XmlHttpRequest` (otherwise `SecureOrigin` answers `{"status":"error","message":"Not Allowed"}`) and `credentials: "same-origin"`.
- Every URL is resolved against `document.baseURI` (from `<base href="{{ .base }}">`). Never use a leading `/`. The base can be a sub-path such as `/files/`.
- API responses look like `{"status":"ok","result":…}` or `{"status":"error","message":…}`. `GET /admin/api/logs` and `GET /about` return text.
- Same app URLs as today: `admin/storage`, `admin/workflow`, `admin/workflow/<id>`, `admin/workflow/new`, `admin/activity`, `admin/settings`, `admin/about`, `admin/setup`, `admin` (and `admin/`).
- Built output goes in `public/assets/admin/`, with entry files named exactly `index.js` and `index.css` (no hash). The page loads them as `./admin/assets/{{ .version }}/admin/index.js`.
- Nothing is written to the server until the user presses Save, Create, Delete (confirmed), or Apply (presets).
- Delete always confirms. Discard, Cancel, and closing a dialog confirm when there are unsaved changes.
- The saved config never holds `attribute_mapping.params` entries for storages that aren't in "sign in" mode. Every other connection key the UI doesn't edit (pinned fields) is round-tripped untouched.
- Storage names: unique, non-empty after trimming, no commas (`related_backend` is comma-separated).
- Lint/format: Prettier defaults from the scaffold. TypeScript `strict: true`.

## Review Focus

1. **Sub-path base** (`FILESTASH_BASE=/files`): every request, link, and route must work under `http://host/files/admin/...`. Pinned by tests in Task 2 (`apiUrl`) and Task 5 (`parseRoute`).
2. **Labels with spaces or mixed case** ("Company files"), and `related_backend` written with odd spacing (`"s3 ,  Company files"`): matching trims like the server and stays case-sensitive. Pinned in Task 4.
3. **Corrupt or empty `params` strings** (`""`, `"null"`, invalid JSON) in `identity_provider.params` and `attribute_mapping.params`: the page loads and treats them as `{}` instead of crashing. Pinned in Task 4.
4. **Session expiring mid-edit, then Save:** the save fails with FORBIDDEN, the login dialog appears, the draft survives, and saving again works. Pinned in Task 6 (`saveConfig` error) and Task 7 (`createDraft` not reset on failure).
5. **Number fields:** an empty input saves `null`, not `0`, and decimals are kept (the old admin used `parseInt`). Pinned in Task 3.

---

## File structure

```
admin/
  package.json, vite.config.ts, tsconfig.json, svelte.config.js, components.json, index.html
  src/main.ts                      – mounts App
  src/App.svelte                   – session gate + shell + router outlet
  src/app.css                      – tailwind + shadcn theme tokens
  src/lib/components/ui/*          – shadcn-svelte generated components (CLI)
  src/lib/api/http.ts              – apiUrl, request, ApiError
  src/lib/api/endpoints.ts         – typed endpoint functions
  src/lib/config/schema.ts         – form-schema ↔ plain values
  src/lib/config/storage.ts        – storage model ↔ connections/middleware
  src/lib/config/save.ts           – fetch-merge-post save
  src/lib/router.ts                – base-aware router + guard
  src/lib/session.svelte.ts        – admin session store
  src/lib/draft.svelte.ts          – draft/dirty helper
  src/lib/components/SchemaForm.svelte, SchemaField.svelte, SaveBar.svelte, ConfirmDialog.svelte, Help.svelte
  src/lib/shell/Sidebar.svelte, Layout.svelte, LoginForm.svelte, LoginDialog.svelte
  src/pages/storage/StoragePage.svelte, StorageCard.svelte, StorageForm.svelte, CreateStorageDialog.svelte, LoginMethodDialog.svelte, LeftoversNotice.svelte
  src/pages/settings/SettingsPage.svelte
  src/pages/activity/ActivityPage.svelte, LogViewer.svelte, LogChart.svelte, LogSettings.svelte, Audit.svelte
  src/pages/workflow/WorkflowList.svelte, WorkflowEditor.svelte, StepCard.svelte, model.ts
  src/pages/setup/SetupPage.svelte, presets.ts
  src/pages/about/AboutPage.svelte
  src/**/*.test.ts                 – Vitest, next to the code
public/index.backoffice.html       – rewritten Go template
public/assets/admin/               – build output (committed)
```

---

### Task 1: Scaffold the app and wire it into Go

**Files:**
- Create: `admin/` (Vite Svelte-TS scaffold), `admin/vite.config.ts`, `admin/index.html`, `admin/src/main.ts`, `admin/src/App.svelte`, `admin/src/app.css`, `admin/components.json`
- Modify: `public/index.backoffice.html` (full rewrite)
- Create (build output): `public/assets/admin/index.js`, `public/assets/admin/index.css`
- Test: `admin/src/smoke.test.ts`

**Interfaces:**
- Produces: `npm run build` (writes `public/assets/admin/`), `npm run dev` (port 5173, proxying to `http://localhost:8334`), `npm test` (vitest run), the `$lib` alias → `admin/src/lib`.

- [ ] **Step 1: Scaffold.** `npm create vite@latest admin -- --template svelte-ts`. Then in `admin/`: `npm i -D tailwindcss @tailwindcss/vite vitest jsdom @testing-library/svelte @testing-library/jest-dom`, `npm i bcryptjs marked`, `npm i -D @types/bcryptjs`. Run `npx shadcn-svelte@latest init` (Vite, `$lib` alias, base color slate). Then `npx shadcn-svelte@latest add button input textarea label checkbox switch radio-group select dialog alert-dialog card badge tabs collapsible tooltip sonner separator skeleton scroll-area`.
- [ ] **Step 2: `vite.config.ts`.** `base: "./"`. `build.outDir: "../public/assets/admin"`, `emptyOutDir: true`, `rollupOptions.output`: `entryFileNames: "index.js"`, `chunkFileNames: "chunks/[name]-[hash].js"`, `assetFileNames: (a) => a.name?.endsWith(".css") ? "index.css" : "assets/[name]-[hash][extname]"`. `resolve.alias $lib`. `server.proxy` for `^/(admin/api|api|about)` → `http://localhost:8334`. `test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"] }`. In `admin/index.html`, add `<base href="/">` (dev only).
- [ ] **Step 3: Write a smoke test** `smoke.test.ts`: render `App` and expect the text `Admin console` to be present.
- [ ] **Step 4: Run** `cd admin && npm test`. Expected: FAIL (App doesn't render that yet).
- [ ] **Step 5: Implement** a minimal `App.svelte` that renders `<h1>Admin console</h1>` and imports `app.css`. In `main.ts`, follow the system color scheme: toggle the `dark` class on `document.documentElement` from `matchMedia("(prefers-color-scheme: dark)")`, and update it on `change`. Run `npm test`. Expected: PASS.
- [ ] **Step 6: Rewrite `public/index.backoffice.html`** as a Go template: keep `<base href="{{ .base }}">`, charset/viewport meta, `<link rel="icon" href="favicon.ico">`, `<title>Admin Console</title>`, `<link rel="stylesheet" href="./admin/assets/{{ .version }}/admin/index.css">`, `<div id="app"></div>`, `<script type="module" src="./admin/assets/{{ .version }}/admin/index.js"></script>`, and the `<noscript>` block.
- [ ] **Step 7: Build and verify through Go.** `cd admin && npm run build`. Restart the dev server (`DEBUG=true ./dist/filestash` from the repo root; it reads the template at startup). Then `curl -s localhost:8334/admin/storage | grep 'admin/index.js'` should print the script tag, and `curl -s -o /dev/null -w '%{http_code}' localhost:8334/admin/assets/x/admin/index.js` should print `200`. In the browser, disable the cache (the index ETag doesn't change between builds). `/admin/storage` shows "Admin console".
- [ ] **Step 8: Add `admin/node_modules` to `.gitignore`** if the root one doesn't cover it (it has `node_modules/`, which does). Commit: `git add admin public/index.backoffice.html public/assets/admin && git commit -m "feature (admin): scaffold svelte admin app"`.

### Task 2: HTTP client and endpoints

**Files:**
- Create: `admin/src/lib/types.ts`, `admin/src/lib/api/http.ts`, `admin/src/lib/api/endpoints.ts`
- Test: `admin/src/lib/api/http.test.ts`

**Interfaces:**
- Produces:
  - `types.ts` holds every shared type, so the modules don't import each other's types: `FormElement`, `Schema` (shapes in Task 3), `Connection` (Task 4), `Step`, `Workflow`, `StepSpec`, `HistoryItem` (Task 12). The later tasks' "Produces" lines describe these types; they're defined here.
  - `apiUrl(path: string): string`: `new URL(path, document.baseURI).toString()`. Throws if `path` starts with `/`.
  - `class ApiError extends Error { code: "FORBIDDEN" | "NOT_ALLOWED" | "SERVER" | "NETWORK" | "OTHER"; status: number }`
  - `request<T>(method: "GET"|"POST"|"DELETE", path: string, body?: unknown, opts?: { text?: boolean }): Promise<T>`
  - `endpoints.ts`: `getAdminConfig(): Promise<Schema>`, `postConfig(values: Record<string, unknown>): Promise<void>`, `getPublicConfig(): Promise<{ connections: Connection[]; auth: string[] }>`, `getBackends(): Promise<Record<string, Schema>>` (`api/backend`), `getAuthMiddlewares(): Promise<Record<string, Schema>>`, `getSession(): Promise<boolean>`, `login(password: string): Promise<void>`, `getLogs(maxBytes: number): Promise<string>`, `logsUrl(): string`, `getAudit(params: URLSearchParams): Promise<{ form: Schema; render: string }>`, `getWorkflows(): Promise<{ workflows: Workflow[]; triggers: StepSpec[]; actions: StepSpec[] }>`, `getWorkflow(id: string): Promise<Workflow>`, `upsertWorkflow(w: Workflow): Promise<void>`, `deleteWorkflow(id: string): Promise<void>`, `getRelease(): Promise<{ html: string; version: string }>`. (Types come from `$lib/types.ts`.)

- [ ] **Step 1: Write the failing tests** in `http.test.ts`:
  - `apiUrl resolves under a sub-path base`: set `document.head.innerHTML = '<base href="http://h/files/">'`, then `expect(apiUrl("admin/api/config")).toBe("http://h/files/admin/api/config")`.
  - `apiUrl rejects absolute paths`: `expect(() => apiUrl("/admin/api/config")).toThrow()`.
  - `request sends the XHR header and unwraps result`: stub `fetch` to return `{"status":"ok","result":{"a":1}}`. Expect `await request("GET","admin/api/config")` toEqual `{a:1}`, and the fetch init headers contain `X-Requested-With: XmlHttpRequest`.
  - `request maps 403 to FORBIDDEN`: stub status 403 with body `{"status":"error","message":"Permission Denied"}`. Expect it to reject with `ApiError` where `code === "FORBIDDEN"`.
  - `request maps Not Allowed to NOT_ALLOWED`: status 200 or 405 with body `{"status":"error","message":"Not Allowed"}` → `code === "NOT_ALLOWED"`.
  - `request with text:true returns raw text`.
- [ ] **Step 2: Run** `npm test -- http`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `http.ts` and `endpoints.ts`. `getRelease` parses the `GET about` HTML with `DOMParser`, takes the first `<table>` outerHTML, and reads the version from the `X-Powered-By` header using `/^Filestash\/([v.0-9]*)/` (as `model_release.js` does). `login` POSTs `{password}` to `admin/api/session`.
- [ ] **Step 4: Run** `npm test -- http`. Expected: PASS.
- [ ] **Step 5: Commit** `feature (admin): http client and endpoints`.

### Task 3: Form-schema ↔ values

**Files:**
- Create: `admin/src/lib/config/schema.ts`
- Test: `admin/src/lib/config/schema.test.ts`

**Interfaces:**
- Produces:
  - `type FormElement = { label: string; type: string; description?: string; placeholder?: string; options?: string[]; target?: string[]; readonly: boolean; default: unknown; value: unknown; multi?: boolean; datalist?: string[]; required: boolean; id?: string }`
  - `type Schema = { [key: string]: Schema | FormElement }`
  - `isLeaf(node: unknown): node is FormElement`: true when the object has `label`, `type`, `default` and `value` keys (the same rule as the old `formObjToJSON`).
  - `toValues(schema: Schema): Record<string, unknown>`: replaces each leaf with its `value`.
  - `withValues(schema: Schema, values: Record<string, unknown>): Schema`: a deep copy with leaf `value`s replaced from matching paths. Paths missing from `values` keep the schema value.
  - `coerce(el: FormElement, raw: string | boolean | null): unknown`: for `number`, `""`/null → `null`, otherwise `Number(raw)` (decimals kept). For `boolean`, a boolean. For the rest, the raw string, with `""` → `null`.
  - `omit(values: Record<string, unknown>, keys: string[]): Record<string, unknown>`, `pick(...)`.

- [ ] **Step 1: Write the failing tests:**
  - `toValues flattens nested leaves`: for `{general:{name:{label:"name",type:"text",readonly:false,default:"Filestash",value:null,required:false}}, features:{api:{enable:{…value:true}}}}`, expect `{general:{name:null},features:{api:{enable:true}}}`.
  - `withValues round-trips`: `toValues(withValues(s, v))` toEqual `v`, for a two-level schema.
  - `coerce number keeps decimals and maps empty to null`: `coerce(numEl,"1.5") === 1.5` and `coerce(numEl,"") === null`.
  - `isLeaf ignores section objects that happen to have a "type" key`: `isLeaf({type:{label:"type",type:"hidden",readonly:false,default:null,value:"x",required:false}})` → false.
- [ ] **Step 2: Run** `npm test -- schema`. Expected: FAIL.
- [ ] **Step 3: Implement** `schema.ts`.
- [ ] **Step 4: Run** `npm test -- schema`. Expected: PASS.
- [ ] **Step 5: Commit** `feature (admin): config schema helpers`.

### Task 4: Storage model (the core mapping)

**Files:**
- Create: `admin/src/lib/config/storage.ts`
- Test: `admin/src/lib/config/storage.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks besides the types.
- Produces:
  - `type Connection = { type: string; label: string; [pinned: string]: unknown }`
  - `type Mode = "own" | "signin"`
  - `type StorageEntry = { key: string /* stable id, e.g. "c0","c1" or "new-<n>" */; original: Connection | null; type: string; label: string; mode: Mode; details: Record<string, string> }`
  - `type Middleware = { identity_provider: { type: string | null; params: string }; attribute_mapping: { related_backend: string; params: string } }`
  - `type StorageState = { entries: StorageEntry[]; method: string | null; methodParams: Record<string, string>; leftovers: Leftovers }`
  - `type Leftovers = { relatedLabels: string[]; paramKeys: string[] }`: labels and keys that don't match any connection, plus (when the method is null) every `related_backend` label and `params` key.
  - `parseJSONObject(s: unknown): Record<string, any>`: returns `{}` for `""`, `"null"`, invalid JSON, or non-objects.
  - `splitRelated(s: string): string[]`: split on `,`, trim, drop empties.
  - `loadStorage(connections: Connection[], mw: Middleware): StorageState`
  - `saveStorage(state: StorageState, opts?: { removeLeftovers?: boolean }): { connections: Connection[]; middleware: Middleware }`
  - `validateLabel(label: string, others: string[]): string | null`: returns an error message, or null when the label is valid.
  - `duplicateLabels(entries: StorageEntry[]): Set<string>`
  - `nextLabel(type: string, entries: StorageEntry[]): string`: returns `type` if free, otherwise `` `${type} 2` ``, `` `${type} 3` ``, and so on.
  - `usesSignIn(state: StorageState): StorageEntry[]`
  - `setMethod(state: StorageState, method: string | null, params: Record<string,string>): StorageState`: when `method` is null, every entry becomes `mode: "own"` with `details: {}`.

Rules, from the spec, that the tests pin down:
- An entry's mode is `"signin"` only when `method` is non-null **and** its label is in `splitRelated(related_backend)` (case-sensitive).
- `saveStorage`:
  - `connections` keep the order of entries and every original key. Only `label` changes, on rename, and `type` is the entry's type.
  - `related_backend` = the labels of signin entries joined with `", "`.
  - `attribute_mapping.params` = `JSON.stringify({ [label]: { type, ...details } })` for signin entries only.
  - With `removeLeftovers: false`, leftover `params` keys and `related_backend` labels are carried through unchanged, **except** when `method` is null. Then `related_backend` is `""` and `params` is `"{}"`.
  - `identity_provider` = `{ type: method ?? "", params: JSON.stringify(methodParams) }`.

- [ ] **Step 1: Write the failing tests** (each one a named `it`):
  - `loads mode from method + related_backend`: method `htpasswd`, related `"s3, Company files"`, connections `[{type:"s3",label:"s3"},{type:"sftp",label:"Company files"},{type:"ftp",label:"ftp"}]` → modes `["signin","signin","own"]`.
  - `matching trims spaces and is case-sensitive`: related `"s3 ,  Company files,S3x"` → `Company files` is signin. A connection labelled `s3x` is own.
  - `method none means every storage is own and the leftovers are listed`: method `""`, related `"s3"`, params `{"s3":{...}}` → all own. `leftovers.relatedLabels` = `["s3"]`, `paramKeys` = `["s3"]`.
  - `corrupt params strings load as empty`: identity params `""` and attribute params `"not json"` → no throw; `methodParams` = `{}` and details = `{}`.
  - `round-trips pinned connection fields`: connection `{type:"sftp",label:"x",hostname:"h",path:"/data"}` → `saveStorage(loadStorage(...)).connections[0]` toEqual the same object.
  - `rename updates connection, related_backend and params key together`: rename signin `s3` → `Company S3` → connections label `Company S3`, related `"Company S3"`, and params has the key `Company S3` but not `s3`.
  - `switching to own drops params entry on save`: set mode own on a signin entry → params lacks its label and related lacks it.
  - `delete removes connection, related label and params key`.
  - `choosing none clears related_backend and params`: `setMethod(state,null,{})` then save → related `""`, params `"{}"`, identity type `""`.
  - `leftovers are preserved unless removeLeftovers`: related `"s3, ghost"`, params `{ghost:{type:"ftp"}}` → save keeps `ghost` in both; with `{removeLeftovers:true}` they're gone.
  - `validateLabel`: `""` → error, `"a,b"` → error mentioning comma, `"s3"` with others `["s3"]` → error, `" ok "` with others `[]` → null.
  - `duplicateLabels finds repeated labels`: two entries labelled `s3` → `Set{"s3"}`.
  - `nextLabel de-duplicates`: entries `s3`, `s3 2` → `nextLabel("s3")` = `"s3 3"`.
  - `does not mutate input`: deep-freeze the inputs; load and save don't throw.
- [ ] **Step 2: Run** `npm test -- storage`. Expected: FAIL.
- [ ] **Step 3: Implement** `storage.ts`. Entry keys are `` `c${index}` `` for loaded connections. New entries get keys from a module counter.
- [ ] **Step 4: Run** `npm test -- storage`. Expected: PASS.
- [ ] **Step 5: Commit** `feature (admin): storage config model`.

### Task 5: Router and navigation guard

**Files:**
- Create: `admin/src/lib/router.ts`
- Test: `admin/src/lib/router.test.ts`

**Interfaces:**
- Produces:
  - `type Route = { name: "storage" | "workflow-list" | "workflow-edit" | "workflow-new" | "activity" | "settings" | "about" | "setup" | "home"; params: Record<string,string>; query: URLSearchParams }`
  - `parseRoute(pathname: string, search: string, baseURI: string): Route | null`: strips the base pathname, then matches `admin/storage`, `admin/workflow`, `admin/workflow/new`, `admin/workflow/<id>`, `admin/activity`, `admin/settings`, `admin/about`, `admin/setup`, `admin`, `admin/`. `admin/workflow?specs=<b64>` maps to `workflow-new` (or to `workflow-edit` when the decoded spec has an `id`), with `params.specs` set.
  - `href(path: string): string`: the base-relative href.
  - `navigate(path: string, opts?: { replace?: boolean }): Promise<boolean>`: runs the guards first and returns false if one cancels.
  - `route`: a Svelte store or `$state` holding the current `Route`, updated on `popstate` and `navigate`.
  - `type Guard = { isDirty: () => boolean; confirm: () => Promise<boolean> }`
  - `addGuard(g: Guard): () => void`: returns a function that unregisters the guard. `navigate` asks `confirm()` on each dirty guard and cancels if any returns false. `beforeunload` calls `preventDefault()` when any guard `isDirty()`.
  - `safeNext(next: string | null, origin: string): string | null`: returns `next` only when it's same-origin.
- [ ] **Step 1: Write the failing tests:**
  - `parses under sub-path base`: `parseRoute("/files/admin/storage","","http://h/files/")?.name === "storage"`.
  - `parses workflow id`: `/admin/workflow/abc` → name `workflow-edit`, `params.id === "abc"`.
  - `legacy specs link opens`: `/admin/workflow` + `?specs=` + `btoa(JSON.stringify({id:"x",name:"n"}))` → `workflow-edit`, `params.id === "x"`.
  - `unknown path returns null`.
  - `navigate is cancelled by a dirty guard whose confirm returns false`, and `navigate proceeds when the guard is clean` (confirm not called).
  - `safeNext rejects other origins`: `safeNext("https://evil/x","http://h")` → null. `safeNext("/admin/settings","http://h")` → `"/admin/settings"`.
- [ ] **Step 2: Run** `npm test -- router`. Expected: FAIL.
- [ ] **Step 3: Implement** `router.ts`. Intercept clicks on `a[data-link]` and call `navigate`.
- [ ] **Step 4: Run** `npm test -- router`. Expected: PASS.
- [ ] **Step 5: Commit** `feature (admin): base-aware router with unsaved-changes guard`.

### Task 6: Save merge and session

**Files:**
- Create: `admin/src/lib/config/save.ts`, `admin/src/lib/session.svelte.ts`
- Test: `admin/src/lib/config/save.test.ts`, `admin/src/lib/session.test.ts`

**Interfaces:**
- Consumes: `getAdminConfig`, `getPublicConfig`, `postConfig` (Task 2); `toValues` (Task 3); `Connection`, `Middleware` (Task 4).
- Produces:
  - `saveConfig(patch: (current: { values: Record<string, unknown>; connections: Connection[] }) => { values: Record<string, unknown>; connections: Connection[] }): Promise<void>`. It fetches the admin config and the public connections **fresh**, `toValues`es the admin config, drops `constant`, applies `patch`, then POSTs `{...values, connections}`. It rethrows `ApiError`. On `FORBIDDEN` it also calls `session.requireLogin()` before rethrowing.
  - `session`: `{ isAdmin: boolean | null; loginOpen: boolean; requireLogin(): void; login(password): Promise<void>; refresh(): Promise<void>; start(): () => void }`. `start` polls `getSession` every 30000 ms and on `visibilitychange` to visible, and returns a stop function. When `isAdmin` changes from true to false, it sets `loginOpen = true` instead of navigating anywhere.
- [ ] **Step 1: Write the failing tests:**
  - `saveConfig merges against fresh server state`: mock the admin config `{general:{name:leaf("A")}, log:{enable:leaf(true)}, constant:{user:leaf("x")}}` and public connections `[{type:"s3",label:"s3",hostname:"h"}]`. Patch sets `values.general.name = "B"`. Expect the POST body toEqual `{general:{name:"B"},log:{enable:true},connections:[{type:"s3",label:"s3",hostname:"h"}]}`, with no `constant` key.
  - `saveConfig on FORBIDDEN opens login and rethrows`: postConfig rejects `ApiError("FORBIDDEN")`. Expect the promise to reject and `session.loginOpen === true`.
  - `session start polls every 30s`: use fake timers. `getSession` is called once at start and again after 30000 ms.
- [ ] **Step 2: Run** `npm test -- save session`. Expected: FAIL.
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Run** `npm test -- save session`. Expected: PASS.
- [ ] **Step 5: Commit** `feature (admin): save merge and admin session`.

### Task 7: Shared UI pieces (draft, save bar, confirm, schema form)

**Files:**
- Create: `admin/src/lib/draft.svelte.ts`, `admin/src/lib/components/SaveBar.svelte`, `ConfirmDialog.svelte`, `SchemaForm.svelte`, `SchemaField.svelte`, `Help.svelte`
- Test: `admin/src/lib/draft.test.ts`, `admin/src/lib/components/SchemaForm.test.ts`

**Interfaces:**
- Consumes: `addGuard` (Task 5), `Schema`, `FormElement`, `coerce` (Task 3).
- Produces:
  - `createDraft<T>(initial: T): { value: T; readonly dirty: boolean; reset(next?: T): void; save(fn: (v: T) => Promise<T | void>): Promise<boolean> }`. `dirty` compares a deep clone of the baseline with `value`. `save` resets the baseline only when `fn` resolves, and returns false on error, keeping the draft. Creating a draft registers a router guard; the component calls the returned `dispose()` on destroy (so the return type also has `dispose(): void`).
  - `confirm(opts: { title: string; body: string; confirmLabel: string; destructive?: boolean }): Promise<boolean>`: a promise API backed by a single `ConfirmDialog` (shadcn `alert-dialog`) mounted in `App`.
  - `<SaveBar dirty onSave onDiscard saving? saveLabel="Save" error?>`: a sticky bottom bar showing "Unsaved changes", Discard (calls `confirm` before `onDiscard`), and Save. Hidden when `!dirty && !error`.
  - `<SchemaForm schema={Schema} bind:values prefix="" hidden={string[]}>`: renders the `Schema` recursively. Sections become headings. Leaves go to `SchemaField`.
  - `<SchemaField el name bind:value>`, by `el.type`:
    - `text` → Input; `password`, `long_password` → Input type password with a show toggle; `long_text`, `json` → Textarea
    - `number` → Input type number; `boolean` → Switch; `select` → Select with `el.options`
    - `date`/`datetime` → Input of that type; `file`/`image` → file input read as a data URL
    - `hidden` → nothing rendered, but the value is kept
    - `bcrypt` → password Input whose value is hashed with `bcryptjs.hashSync` on blur
    - `enable` → a Collapsible trigger labelled `el.placeholder || el.label` that shows or hides sibling leaves whose `id` is in `el.target`
    - unknown types (`directory`, `bearer`, `arraybuffer`, …) → text Input
    - `readonly` → disabled
    - `datalist` → `<datalist>`
    - `description` → `Help` (rendered with `marked`, behind a "How to…" collapsible when longer than 140 characters, otherwise inline muted text)
    - a `banner` leaf → `Help` at the top of the form
- [ ] **Step 1: Write the failing tests:**
  - `draft dirty tracks edits and reset`: `const d = createDraft({a:1}); d.value.a = 2;` → `d.dirty` is true; `d.reset()` → false and `d.value.a === 1`.
  - `draft save failure keeps edits`: `d.value.a=2; await d.save(() => Promise.reject(new Error()))` → returns false, `d.dirty` true, `d.value.a === 2`.
  - `SchemaForm hides enable targets until toggled`: render the sftp schema (fields `hostname`, `advanced`(enable, target `["sftp_port"]`), `port`(id `sftp_port`)). `port` isn't visible; click "Advanced"; `port` is visible.
  - `SchemaForm number empty binds null`: clear a number input → bound value `null`.
  - `SchemaForm unknown type falls back to text input`: type `directory` renders a textbox.
- [ ] **Step 2: Run** `npm test -- draft SchemaForm`. Expected: FAIL.
- [ ] **Step 3: Implement** the modules and components listed above.
- [ ] **Step 4: Run** `npm test -- draft SchemaForm`. Expected: PASS.
- [ ] **Step 5: Commit** `feature (admin): draft, save bar, confirm dialog, schema form`.

### Task 8: Shell (layout, nav, login, session dialog, routing outlet)

**Files:**
- Create: `admin/src/lib/shell/Layout.svelte`, `Sidebar.svelte`, `LoginForm.svelte`, `LoginDialog.svelte`
- Modify: `admin/src/App.svelte`
- Test: `admin/src/lib/shell/shell.test.ts`

**Interfaces:**
- Consumes: `session` (Task 6), `route`, `navigate`, `safeNext` (Task 5), `getRelease` (Task 2), `ConfirmDialog` and the sonner `Toaster` (Task 7).
- Produces: `App` renders:
  - `setup` → SetupPage, with no shell. Redirects to `admin/` when the session says admin and an admin password exists. Today's behavior: the setup page is reachable only while `GET session` is true; when there's no admin password the server redirects any admin path to setup.
  - `home` → navigate to `safeNext(query.next)` (a full `location.href` assignment, since it may be a non-admin path), or to `admin/storage`.
  - otherwise → `isAdmin === false` and not yet logged in shows the full-page `LoginForm`; once logged in, `Layout` with `Sidebar` (Storage, Workflow, Activity, Settings, version → About, active item highlighted) and the page component for the route.
  - `LoginDialog` opens over the page when `session.loginOpen`; a successful login closes it and doesn't touch page state.
  - Unknown route → "Page not found" with a link to Storage.
- [ ] **Step 1: Write the failing tests:**
  - `shows login form when not admin`: session `isAdmin=false` → a password field and no sidebar.
  - `shows sidebar when admin`: session true, route storage → the "Storage" nav item has `aria-current="page"`.
  - `expired session opens dialog without unmounting page`: render the Settings route, set `loginOpen=true` → the dialog is visible and the page heading is still in the DOM.
- [ ] **Step 2: Run** `npm test -- shell`. Expected: FAIL.
- [ ] **Step 3: Implement.** Pages that don't exist yet render a placeholder component named after the route; later tasks replace them. A wrong password shows the error "Incorrect password" under the field. The login request takes ~1.5s, so show a spinner on the submit button.
- [ ] **Step 4: Run** `npm test -- shell`. Expected: PASS. Then `npm run build`, and on the dev instance check `/admin`, `/admin/storage`, logout (delete the `admin` cookie) → login form; log in → back on the page.
- [ ] **Step 5: Commit** `feature (admin): shell, navigation and admin login`.

### Task 9: Storage page

**Files:**
- Create: `admin/src/pages/storage/StoragePage.svelte`, `StorageCard.svelte`, `StorageForm.svelte`, `CreateStorageDialog.svelte`, `LeftoversNotice.svelte`
- Test: `admin/src/pages/storage/storage-page.test.ts`

**Interfaces:**
- Consumes: `loadStorage`, `saveStorage`, `validateLabel`, `duplicateLabels`, `nextLabel`, `usesSignIn`, `StorageState`, `StorageEntry` (Task 4); `saveConfig` (Task 6); `getBackends`, `getAdminConfig`, `getPublicConfig` (Task 2); `createDraft`, `SaveBar`, `confirm`, `SchemaForm` (Task 7); `LoginMethodDialog` (Task 10; until then, render a disabled "configure" link).
- Produces: `StorageForm` props `{ entry: StorageEntry; backends: Record<string, Schema>; method: string | null; otherLabels: string[]; onOpenLoginMethod(): void }`, used by both the create dialog and the edit panel.

Behavior, from the spec's "Storage page" and "Existing configs" sections:
- Left column: cards (name, type badge, mode text "Users enter their own login" or "Sign in with <method>"), a "Duplicate name" badge when the label is in `duplicateLabels`, a **+** button at the bottom, and under the list "Login method: <method or None> · configure".
- Right column: the edit panel for the selected entry, with its own `createDraft` holding the whole `StorageState`, so one Save writes everything.
  - Fields: Name (validated with `validateLabel`), then a radio "How do people get in?" with options `Users enter their own <TYPE> login on the login page` and `Users sign in with <method>, you hold the credentials`. The second is disabled with a link "Set up a login method first" when `method` is null.
  - Connection details: `SchemaForm` for `backends[type]` bound to `entry.details`, shown only in signin mode, with a hint listing the method's variables (Task 10 exports `methodVariables(method)`; until then, show `{{ .user }} {{ .password }}`).
  - When switching a saved signin entry to own: inline warning "The stored connection details will be removed when you save."
  - "Delete storage" → `confirm({title:"Delete <label>?", destructive:true, confirmLabel:"Delete"})`, then save.
- Create dialog (shadcn `dialog`): a type grid (keys of `backends`, sorted), Name (default `nextLabel(type)`), the mode radio, details. Cancel or close confirms when anything was typed. **Create** appends the entry, saves, and selects it.
- Save: `saveConfig(({values, connections}) => { const out = saveStorage(state, {removeLeftovers}); return { values: {...values, middleware: out.middleware}, connections: out.connections }; })`. Blocked, with an error in the save bar, while `duplicateLabels` is non-empty or any `validateLabel` fails.
- `LeftoversNotice`: shown when leftovers are non-empty. Text "N leftover settings from an older configuration", a details list, and a "Remove leftovers" button (confirm) that sets `removeLeftovers` and marks the draft dirty.
- The drafted values for an entry are kept when its mode toggles (details aren't cleared until save).

- [ ] **Step 1: Write the failing tests** (mock the endpoints):
  - `adding S3 opens a create form, not a duplicate row`: click "+", pick S3 → a dialog with the Name `s3`. Cancel without typing → no confirm and no new card.
  - `switching mode back and forth keeps typed details`: open a signin S3 entry, type `AKIA1` in `access_key_id`, switch to own, switch back → the value is `AKIA1`.
  - `nothing is posted until Save`: edit the name → `postConfig` not called. Click Save → called once.
  - `duplicate names block save`: load connections with two `s3` → both cards show "Duplicate name", and Save shows an error and doesn't post.
  - `delete asks for confirmation`.
  - `discard with changes asks for confirmation`.
- [ ] **Step 2: Run** `npm test -- storage-page`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -- storage-page`. Expected: PASS. `npm run build`, then on the dev instance reproduce the original problem: add S3 and SFTP, sign-in mode with htpasswd, fill details, Save; reload → values present. Switch S3 to own and back without saving → values kept.
- [ ] **Step 5: Commit** `feature (admin): storage page`.

### Task 10: Login method dialog

**Files:**
- Create: `admin/src/pages/storage/LoginMethodDialog.svelte`, `admin/src/pages/storage/method.ts`
- Modify: `admin/src/pages/storage/StoragePage.svelte` (wire the "configure" link and the variables hint)
- Test: `admin/src/pages/storage/method.test.ts`, `admin/src/pages/storage/login-method.test.ts`

**Interfaces:**
- Consumes: `setMethod`, `usesSignIn` (Task 4); `getAuthMiddlewares` (Task 2); `SchemaForm`, `confirm` (Task 7).
- Produces:
  - `methodVariables(spec: Schema | undefined): string[]`: extracts `{{ .name }}` tokens from the spec's `banner`, field descriptions, and placeholders, de-duplicated. If none are found, returns `["{{ .user }}", "{{ .password }}"]`.
  - `methodChangeWarning(state: StorageState, next: string | null): string | null`: null when the method doesn't change or nothing uses sign-in. For a new method: `"<labels> will now sign in with <next>."`. For None: `"<labels> will switch to users entering their own login, and their stored connection details will be removed."`.
  - The dialog edits a local copy `{ method, paramsByMethod: Record<string, Record<string,string>> }`, so switching methods keeps each one's typed values. On Save it calls `onApply(method, params)`, which applies `setMethod` to the Storage page's draft and saves it. The Save button label is `Switch to <method>` when the method changes, otherwise `Save`.
- [ ] **Step 1: Write the failing tests:**
  - `methodVariables finds tokens in htpasswd banner`: the banner text from the htpasswd spec (contains `{{ .user }}` and `{{ .password }}`) → both, in order.
  - `warning lists sign-in storages on switch`: state with signin `s3` and method htpasswd; next `ldap` → contains `s3` and `ldap`.
  - `warning for none mentions removal`: next null → contains "removed".
  - `switching methods in the dialog keeps typed values`: type users in htpasswd, switch to ldap, switch back → the users text is still there.
- [ ] **Step 2: Run** `npm test -- method login-method`. Expected: FAIL.
- [ ] **Step 3: Implement.** The method picker lists "None" plus `Object.keys(getAuthMiddlewares())` minus `admin` (the `admin` method exists to protect the admin login itself; keep it if the current config uses it, so it can still be seen).
- [ ] **Step 4: Run.** Expected: PASS. Then on the dev instance: switch htpasswd → ldap → back and confirm no loss; choose None and Save → the S3 details are gone from `dist/data/state/config/config.json` (`related_backend` is `""`).
- [ ] **Step 5: Commit** `feature (admin): login method dialog`.

### Task 11: Settings and Activity pages

**Files:**
- Create: `admin/src/pages/settings/SettingsPage.svelte`, `admin/src/pages/activity/ActivityPage.svelte`, `LogViewer.svelte`, `LogChart.svelte`, `LogSettings.svelte`, `Audit.svelte`, `admin/src/pages/activity/chart.ts`
- Test: `admin/src/pages/activity/chart.test.ts`, `admin/src/pages/settings/settings.test.ts`

**Interfaces:**
- Consumes: `getAdminConfig`, `getLogs`, `logsUrl`, `getAudit` (Task 2); `toValues`, `withValues`, `pick`, `omit` (Task 3); `saveConfig` (Task 6); `createDraft`, `SaveBar`, `SchemaForm` (Task 7).
- Produces: `bucketLogTimes(log: string, buckets = 30, minWidthMs = 5000): { start: number; end: number; counts: number[]; max: number }`. Each line's first 19 characters are parsed as a date. Lines that don't parse are skipped. Trailing empty buckets are marked `-1` (as `ctrl_activity_graph.js` does).
- Settings: the schema minus `constant`, `middleware`, `log`, and `connections`. One `SchemaForm` with a section heading per top-level key, and a `SaveBar`. Save patches only those keys: `values = {...values, ...draftValues}`.
- Activity:
  - LogViewer: `<pre>` with the last 100KB (`getLogs(102400)`) every 2500 ms, paused while hovered or while the tab is hidden, scrolled to the bottom on update unless the user has scrolled up, and a Download link to `logsUrl()` with filename `access_YYYYMMDD.log`.
  - LogChart: `getLogs(307200)` every 2500 ms (paused while the tab is hidden) → `bucketLogTimes` → CSS bars (height `sqrt(count)/sqrt(max)`), with the start time, "Log Events", and the end time.
  - LogSettings: `SchemaForm` over `schema.log` with a SaveBar, saving only `log`.
  - Audit: the form from `getAudit().form`, re-queried 1000 ms after the last input (form keys stripped of the `search.` prefix), and `render` HTML inserted with `{@html}` (server-provided).
- [ ] **Step 1: Write the failing tests:**
  - `bucketLogTimes counts lines into buckets`: three lines at 00:00:00, 00:00:01, and 00:02:30 on the same date → `counts` sum 3, first bucket ≥ 2, `max` ≥ 2.
  - `bucketLogTimes ignores unparseable lines`: `"garbage\n"` + one valid line → sum 1.
  - `settings save sends only owned keys and preserves middleware`: mock the admin config with `general`, `log`, `middleware`; edit `general.name`; Save → the POST body's `middleware` and `log` equal the server values.
- [ ] **Step 2: Run** `npm test -- chart settings`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. On the dev instance: change Settings → General → name, Save, reload → persisted; the Activity log scrolls and the chart renders.
- [ ] **Step 5: Commit** `feature (admin): settings and activity pages`.

### Task 12: Workflow pages

**Files:**
- Create: `admin/src/pages/workflow/model.ts`, `WorkflowList.svelte`, `WorkflowEditor.svelte`, `StepCard.svelte`
- Test: `admin/src/pages/workflow/model.test.ts`

**Interfaces:**
- Consumes: `getWorkflows`, `getWorkflow`, `upsertWorkflow`, `deleteWorkflow` (Task 2); `SchemaForm`, `createDraft`, `confirm`, `SaveBar` (Task 7); `navigate`, `route` (Task 5).
- Produces:
  - `type Step = { name: string; params?: Record<string, string> }`, `type Workflow = { id: string; name: string; published: boolean; trigger: Step; actions: Step[]; updated_at?: string; created_at?: string; history?: HistoryItem[] }`, `type StepSpec = { name: string; title: string; subtitle?: string; icon: string; specs: Schema }`, `type HistoryItem = { id: number | string; created_at: string; status: string; steps: string }`
  - `newWorkflowId(): string`: `Date.now().toString(36) + Math.random().toString(36).slice(2, 6)`.
  - `cleanParams(params: Record<string, unknown>): Record<string,string> | undefined`: drops empty values, and returns undefined when nothing is left.
  - `formatHistory(h: HistoryItem[]): string`: the same text format as `ctrl_workflow_details.js` (feature7), including the `[✗]`, `[○]`, `[✓]` markers, and `Ø` when empty.
  - `decodeLegacySpecs(b64: string): Partial<Workflow> | null`.
- List: published first. Each item shows name, date, and a trigger → actions summary (action name before the `/`). "+" opens a dialog with a name field and a trigger list; choosing a trigger navigates to `admin/workflow/new` holding `{name, published:false, trigger:{name}, actions:[{name:"tools/debug"}]}` (passed through the router state or a module-level store).
- Editor: a name input; a trigger card with its SchemaForm (`mutate` with existing params); action cards with SchemaForm, remove, and drag-to-reorder (native HTML drag-and-drop is fine); an "add action" picker listing `actions` names; a SaveBar with a Publish/Draft switch (`published` boolean); Delete (confirm) for existing ones; and history `<pre>` refreshed every 5000 ms (existing workflows only). Saving a new workflow navigates to `admin/workflow/<id>` (replace).
- [ ] **Step 1: Write the failing tests:**
  - `cleanParams drops empty values`: `{a:"x", b:""}` → `{a:"x"}`; `{b:""}` → undefined.
  - `formatHistory matches legacy format`: item `{id:1, created_at:"2026-10-20 10:00:00", status:"FAILURE", steps: JSON.stringify([{name:"notify/email",done:true},{name:"tools/debug",done:false}])}` → `"date=2026-10-20 time=10:00:00 id=1 status=FAILURE[email ➜ debug[✗]]"`.
  - `formatHistory empty is Ø`.
  - `decodeLegacySpecs handles bad input`: `"%%%"` → null.
- [ ] **Step 2: Run** `npm test -- workflow`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. On the dev instance: create a workflow, add two actions, reorder, publish, reload → order kept; delete with confirm.
- [ ] **Step 5: Commit** `feature (admin): workflow pages`.

### Task 13: Setup wizard and About

**Files:**
- Create: `admin/src/pages/setup/SetupPage.svelte`, `admin/src/pages/setup/presets.ts`, `admin/src/pages/about/AboutPage.svelte`
- Test: `admin/src/pages/setup/presets.test.ts`

**Interfaces:**
- Consumes: `saveConfig` (Task 6), `login` (Task 2), `getBackends`, `getAuthMiddlewares`, `getPublicConfig`, `getAdminConfig`, `getRelease` (Task 2), `confirm` (Task 7).
- Produces:
  - `PRESETS: Preset[]`, copied **exactly** from `public/assets/pages/adminpage/model_setup.js` (names, success text, `input_storage`, `input_auth`, `output_connections`, `output_identity_provider`, `output_attribute_mapping`, and the `isOK` requirements as `{ storage: string; auth: string }`). Read the whole file, including the presets above line 80.
  - `applyPresetInputs(p: Preset, inputs: Record<string,string>, adminPassword?: string): { connections: Connection[]; identity_provider: {type:string; params:string}; attribute_mapping: {related_backend:string; params:string} }`: replaces `[[field]]` placeholders in both `params` strings, escaping `"` as `\"` (as the original does), and `[[admin_password]]` with `adminPassword`.
  - `healthChecks(ctx): Check[]`: HTTPS, non-root (`constant.user !== "root"`), storage configured, support, license. The texts are copied from `model_setup.js`.
- Step 1: a password field. `bcryptjs.hashSync(pwd)` → `saveConfig` setting `auth.admin`, then `login(pwd)`, then step 2. The server only allows this while no admin password is set (`AdminOnly` is open in setup mode).
- Step 2: health checks list and preset buttons. Presets whose `isOK` fails show "Your build is missing some plugins". Presets with inputs open a dialog. **If `connections.length > 0`, confirm first**, listing the storages that will be replaced. Then `saveConfig` replaces `connections`, `middleware.identity_provider`, and `middleware.attribute_mapping`, and a toast shows the preset's success text (as HTML).
- Leaving step 2: if `log.telemetry !== true`, show the telemetry dialog (text copied from `ctrl_setup.js`). If accepted, save `log.telemetry = true`.
- About: renders `getRelease().html` with `{@html}`.
- [ ] **Step 1: Write the failing tests:**
  - `preset placeholders are replaced and quotes escaped`: the SFTP "existing credentials" preset with `{sftp_hostname: 'h"x'}` → `attribute_mapping.params` parses to `{sftp:{type:"sftp",hostname:'h"x',username:"{{ .user }}",password:"{{ .password }}"}}`.
  - `local preset uses admin password`: the preset with `[[admin_password]]` and adminPassword `"pw"` → params contain `"pw"`.
  - `PRESETS count matches legacy`: assert the length equals the number of entries in the legacy `TEMPLATES` array (count them when copying, and hard-code that number in the test).
- [ ] **Step 2: Run** `npm test -- presets`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. On a fresh dev data dir (`mv dist/data dist/data.bak`, restart): `/admin` → setup; set a password (store it in `dist/dev-admin-password.txt`); apply the S3 preset; `/login` shows S3. Afterwards restore the original data with `rm -rf dist/data && mv dist/data.bak dist/data`.
- [ ] **Step 5: Commit** `feature (admin): setup wizard and about page`.

### Task 14: Remove the old admin, final build, end-to-end check

**Files:**
- Delete: `public/assets/pages/adminpage/`, `public/assets/pages/ctrl_adminpage.js`, `public/assets/boot/router_backoffice.js`, `public/assets/boot/ctrl_boot_backoffice.js`
- Create: `admin/README.md`
- Modify: `public/assets/admin/` (rebuild)

- [ ] **Step 1: Check nothing else imports the old files:** `grep -rn "adminpage\|router_backoffice\|ctrl_boot_backoffice\|ctrl_adminpage" public server --include=*.js --include=*.html --include=*.go | grep -v "^public/assets/pages/adminpage/"`. Expected: no output. If there is output, stop and report instead of deleting.
- [ ] **Step 2: Delete the files**, then `cd admin && npm test && npm run build`. Expected: all tests pass and the build succeeds.
- [ ] **Step 3: Go embed check:** from the repo root, rebuild with the overlay (see the spec's "Local dev environment"), then run **without** `DEBUG` (`./dist/filestash`) so the embedded copy is served. `/admin/storage` loads in the browser and the console has no 404s.
- [ ] **Step 4: Sub-path check:** `FILESTASH_BASE=/files DEBUG=true ./dist/filestash` → `http://localhost:8334/files/admin/storage` loads, saves work, and the nav links stay under `/files/`.
- [ ] **Step 5: `admin/README.md`:** how to run dev (`npm run dev` with the Go server on 8334), test, and build, and the fact that the build output in `public/assets/admin/` is committed and must be rebuilt after source changes.
- [ ] **Step 6: Commit** `feature (admin): replace legacy admin console with svelte build`.
