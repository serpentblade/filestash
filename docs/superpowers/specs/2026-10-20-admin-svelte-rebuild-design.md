# Admin console rebuild (Svelte + shadcn-svelte): design

Date: 2026-10-20
Branch: `admin-svelte-rebuild` (fork first, pitched upstream later)

## Intent

Filestash's server is solid, but its admin console makes first-time setup confusing and loses settings. In a real session, the person setting it up:

- clicked S3 and had no idea what to do next. A second click silently added a second "s3" connection.
- found S3 credential fields in an unrelated "Authentication Middleware" section further down the page, shown only for labels typed into a free-text "Related backend" box.
- typed `s3, sftp`, changed it to `sftp`, put `s3` back, and lost every S3 setting. The page autosaves the whole config on every change, so removing `s3` from the box wrote a config without the S3 settings.

The goal is an admin console that does the job well enough to raise the perceived quality of the whole product. It's built in Svelte 5 with shadcn-svelte, first in our fork, then offered upstream as a drop-in replacement. "Drop-in" means the Go server, its API and the `config.json` format don't change at all.

## Goals

1. **Storage setup follows how people think about it:** pick a type, name it, choose how people get in, fill in the connection details. Everything for one storage lives in one place.
2. **Nothing is written until the admin presses Save.** Switching options never throws away what was typed. Delete always asks for confirmation. Discard asks when there are unsaved changes.
3. **The login method (htpasswd, LDAP, OIDC, …) has its own clear configure screen.** Switching methods keeps what was typed, and the admin is warned before a change affects storages.
4. **Every existing admin page is ported** (Settings, Activity, Workflow, setup wizard, About, admin login), with Save buttons instead of autosave.
5. **Approachable for other developers.** Mainstream tooling (Svelte 5, Vite, TypeScript, Tailwind, shadcn-svelte) replaces the hand-rolled RxJS/DOM code.

## Non-goals

- Any change to the Go backend, the admin API, the `config.json` format, or the end-user login page.
- New admin features beyond what's described here: no new "locked/pre-filled field" feature for user-entered logins, no Settings search, no user management, no new audit features.
- Rebuilding the end-user (front-office) app.
- Visual parity with the current Filestash look. shadcn defaults are fine for now. Theming to match Filestash is a later step.

## Anti-goals (failure even if it "works")

- Any path where the admin loses typed settings without saying so: switching an option, editing another storage, changing the login method, navigating away, or the session expiring.
- Rewriting `config.json` in a way that drops data the new UI doesn't show (see "Preserve what the UI doesn't show").
- Requiring the upstream maintainer to adopt a Node build step to keep the app working (see "Upstream packaging").

## Constraints

### Backend contract (unchanged; the admin must work against it as-is)

All under `{base}/admin/api/` (`server/routes.go:44-63`):

| Endpoint | Use |
|---|---|
| `GET /session` | `true` if logged in as admin, or if no admin password is set yet (setup mode) |
| `POST /session` `{password}` | Admin login. Sets the `admin` cookie (path `/admin/api/`, 1h). Deliberately slow (~1.5s). |
| `GET /config` | Full config as a **form schema**: nested objects whose leaves are `FormElement`s (`label, type, description, placeholder, options, target, readonly, default, value, multi, datalist, required, id`). Also has a read-only `constant` section (`user`, `license`). |
| `POST /config` | **Replaces the whole config file** with the posted JSON: plain values, not the schema, plus `connections`. No partial update and no validation. |
| `GET /middlewares/authentication` | Map of login-method id → form spec (htpasswd, ldap, local, passthrough, wordpress, admin, openid, saml, … depending on build) |
| `GET /logs?maxSize=N` | Tail of `access.log` as text |
| `GET /audit?…` | `{form, render}`. `render` is HTML from the audit plugin. |
| `GET/POST/DELETE /workflow`, `GET /workflow/{id}` | Workflow CRUD. `GET /workflow` returns `{workflows, triggers, actions}`. |

Also used: the public `GET {base}/api/config` (contains `connections`), `GET {base}/api/backend` (map of storage type → login form spec), and the release/about endpoint used by `model_release.js`.

### Config mapping (how the UI concepts map to `config.json`)

- **Storages** are `connections: [{type, label, ...pinned}]`. The order is the tab order on the login page. `label` is the identity.
- **Login method** is `middleware.identity_provider = {type, params}`, where `params` is a **JSON-encoded string** of that method's settings. `type: ""`/null means none.
- **"Users sign in with the login method, admin holds the credentials"** for a storage means its label appears in `middleware.attribute_mapping.related_backend`, a comma-separated string. Its connection details are `attribute_mapping.params` (a JSON-encoded string) under the key `<label>`: `{"<label>": {"type": "...", field: value, ...}}`. Values may contain templates such as `{{ .user }}` and `{{ .password }}`, filled in from the login method.
- **"Users enter their own login"** means the label is *not* in `related_backend`. The login page then shows that storage type's normal login form.
- When the login method is none, the server treats every storage as "users enter their own login", whatever `related_backend` says (`server/pkg/frontend/config.go:56`, `server/pkg/session/handler_auth_direct.go`).
- `attribute_mapping.params` is among the keys the server encrypts at rest (`configKeysToEncrypt`). The admin sees and sends it in plain text; the server handles encryption.

### Preserve what the UI doesn't show

- Connection entries may carry extra "pinned" fields beyond `type`/`label` (e.g. a fixed `hostname` or `path`). The server enforces these on direct logins (`isMatchingPinnedFields` in `handler_auth_direct.go`). The current admin strips them on every save. **The new admin must round-trip every key on a connection that it doesn't edit.**
- More generally, a save must start from the server's current config and change only what the page owns. It must not rebuild the whole config from what's on screen.

### Serving and packaging

- Go serves `{base}/admin/*` with no file extension as the Go template `public/index.backoffice.html` (template data: `.base`, `.version`, …). With no admin password set, it redirects to `/admin/setup`.
- Requests for `{base}/admin/<path>.<ext>` are served from `public/<path>`, with `assets/<BUILD_REF>/` rewritten to `assets/`, and `.br`/`.gz` variants used when present (`server/pkg/frontend/static.go`).
- The base path is set **at runtime** (`FILESTASH_BASE`) and reaches the page through `<base href="{{ .base }}">`. The built app must use relative asset URLs and read its base from `document.baseURI`. It must not bake in a base at build time.
- The Go binary embeds `public/` (`embed.go`). In `DEBUG=true` it serves `./public` from disk.
- No built-in plugin patches admin frontend files, but third-party extensions can through `StaticPatch`. Those patches won't apply to the new admin. This is accepted; mention it in the upstream pitch.

## Decisions made with the user

- **Stack:** Svelte with **shadcn-svelte** components.
- **Fork first, pitched upstream as a drop-in admin replacement.** Upstream's CONTRIBUTING.md asks for an issue before any non-bugfix PR. The pitch goes in an issue with screenshots, written as "here's a fix for settings being lost", not as a framework argument.
- **Storage page, layout A:** storage list on the left and edit panel on the right. A **+** at the bottom of the list opens a **create form in a popup (Dialog)**. Clicking a storage edits it in the side panel.
- **Create and edit steps:** type → name → "How do people get in?" (two options: *users enter their own <type> login on the login page* / *users sign in with <login method>, you hold the credentials*) → connection details, shown only for the second option.
- **Cards** show name, type, and login mode at a glance, e.g. "Company files · S3 · Sign in with htpasswd".
- **Renaming a storage keeps its link** to the login method: update `related_backend` and the `params` key together.
- **Storage names must be unique.** The form says so if a name is reused.
- **The login method has its own "configure" link** under the storage list. It opens a popup: choose a method (None, or one of those available), fill in its settings, Save. Switching methods in the popup keeps each method's typed values until it closes.
- **Delete always confirms. Discard confirms when there are unsaved changes.**
- **Admin only:** no change to the login page.
- **Other pages** (Settings, Activity, Workflow, setup wizard, About) are ported with their current behavior, with explicit Save instead of autosave.
- **Switching a storage to "own login" and saving deletes its stored connection details.** Before saving, switching back keeps them; after saving, they have to be re-entered. The panel warns before Save.

## Proposed behavior

### Shell and auth

- Sidebar nav: Storage, Workflow, Activity, Settings, and a version link to About. Same URLs as today: `/admin/storage`, `/admin/workflow`, `/admin/activity`, `/admin/settings`, `/admin/about`, `/admin/setup`. `/admin` redirects to `?next=` if it's same-origin, otherwise to `/admin/storage`.
- Admin login screen: a single password field, as today.
- **Session expiry must not lose drafts** (our call). The current admin swaps the whole page for the login screen. The new one shows the login form in a dialog over the page and keeps every draft. After a successful login the admin can press Save again.
- The session check keeps today's cadence: every 30s and when the tab becomes visible.

### Save model (all pages)

- Each editable area keeps a **draft**: the server value plus local edits. A save bar ("Unsaved changes · Discard · Save") appears when the draft differs from the server value.
- **Save** re-fetches `GET /admin/api/config` and the public `connections`, applies only the keys this page owns, and POSTs the result. Doing this right before saving keeps each page from overwriting another page's or another tab's changes to unrelated keys. A last-write-wins race on the *same* keys remains, because the backend has no versioning. That's accepted.
- After a successful save: a toast, then the drafts reset to the new server values. On failure: an error toast, and the draft is kept.
- Leaving a page with unsaved changes (in-app navigation or closing the tab) asks for confirmation.

### Storage page

- **List:** one card per connection, in config order. Card: name, type badge, mode ("Users enter their own login" / "Sign in with <method>"). A **+** at the bottom.
- **Create dialog:** pick a type (from `GET /api/backend`), name (default: the type name, de-duplicated as `s3 2`), mode radio, then connection details for "sign in" mode only. **Create** adds it to the list and saves. Cancel or close asks first if anything was typed.
- **Edit panel:** same fields as create. Has its own save bar, plus **Delete storage** (confirm). Switching the mode radio back and forth keeps the typed connection details.
- **"Sign in with…" when no login method is set:** the option is disabled and links to the login-method popup ("Set up a login method first").
- **Connection details form:** rendered from the storage type's login form spec, with these adjustments:
  - `type: "hidden"` fields are not shown but are written (e.g. `type`).
  - `type: "enable"` toggles (e.g. SFTP "Advanced") work as collapsible groups that show or hide their `target` fields. The current admin deletes these toggles in the mapping form; we keep them as collapsibles.
  - A hint lists the variables the current login method provides, e.g. `{{ .user }}`, `{{ .password }}`.
- **Switching a storage to "users enter their own login":** remove the label from `related_backend`. The typed details stay in the draft until Save, so switching back before saving restores them. **On Save, `params[label]` is removed** (confirmed by the user: after saving, switching back means re-entering the details). The server does *not* ignore stale entries: the identity-provider callback (`server/pkg/session/handler_auth_idp.go`, around lines 148-163 and 224) and `sdk.NewToken` (`server/pkg/sdk/token.go`) look up `params[label]` using a label from the request, without checking `related_backend`. Leaving the entry in place would keep admin-held credentials usable by anyone who can sign in. The edit panel says so before saving: "The stored connection details will be removed when you save."
- **Invariant: the saved config never holds `params` entries for storages that aren't in "sign in" mode.**
- **Delete:** remove the connection, remove the label from `related_backend`, and remove `params[label]`.
- **Rename:** update `connections[i].label`, the entry in `related_backend`, and the `params` key together.
- **Reorder** (our call: optional, include only if cheap): drag cards to change the login-page tab order.

### Existing configs that break the rules (our call)

Installs set up with the old admin may have duplicate labels (e.g. two `s3`, from clicking twice), `related_backend` entries or `params` keys with no matching connection, or labels whose case or spacing differ from `related_backend`. Load them anyway; never drop anything silently.

- Internally, connections are identified **by position in the list**, not by label.
- **Duplicate names:** the cards are marked "Duplicate name". The Storage page's Save is blocked, and the message points to the card to rename. Other pages aren't affected.
- **Leftovers** (`related_backend` entries or `params` keys with no matching connection, and the method-None leftovers above): a notice above the list says "N leftover settings from an older configuration", with a details view and an explicit **Remove leftovers** action (confirmed). They're kept untouched until the admin removes them, except that they're removed automatically as part of the None/switch-to-own-login cleanups described above.
- `related_backend` matching trims spaces, as the server does (it splits on `,` and trims). It is case-sensitive, also as the server is.

### Login-method popup

- Method picker: "None" plus every id from `GET /admin/api/middlewares/authentication`, excluding none.
- Settings form rendered from that method's spec. The long help text that plugins put in `description`s and in a hidden `banner` field is shown behind a collapsible "How to…". Read-only fields are shown read-only.
- Typed values for each method are kept while the popup is open.
- **On Save, when the method changes and any storage is in "sign in" mode:** a warning names those storages and says their users will now sign in with the new method. The button reads "Switch to <method>".
- **Choosing None** (our call, follows the invariant above): the warning names the "sign in" storages and says they'll switch to "users enter their own login", **and that their stored connection details will be removed**. On Save, clear `related_backend` and `attribute_mapping.params` along with setting `identity_provider.type` to none. A later None → method switch therefore has nothing to bring back silently.
- **A storage's mode is what the server will actually do:** "sign in" only when a login method is set *and* the label is in `related_backend`. If a loaded config has a method of None but a non-empty `related_backend`/`params` (left over from the old admin), treat those storages as "own login", and show the leftovers in the cleanup notice described under "Existing configs that break the rules".
- The popup also shows the variables the method provides to connection details.
- Writes `middleware.identity_provider = {type, params: JSON.stringify(settings)}`. `related_backend` and `attribute_mapping.params` are left alone.

### Settings page

- Port of today's page: a form generated from `GET /admin/api/config`, minus `constant`, `middleware`, `connections`, and `log` (log settings live on Activity, as today). One section per top-level key, with section headings.
- Save bar. Save writes only the keys shown on this page.

### Activity page

- System log viewer (tail ~100KB, refreshing every 2.5s, paused on hover, download link), the event chart (log events over time, as today), log settings form (`log.*`) with a save bar, and the audit search form with plugin-rendered results (`render` HTML shown as-is; it comes from a server plugin).
- Polling stops when the page isn't visible (our call).

### Workflow page

- List: published workflows first, then drafts. Each shows its trigger → actions summary and last-updated date. "+" opens a create dialog: name, then trigger.
- Editor: name, trigger with its settings, an ordered list of actions with settings (drag to reorder, remove), "add action" picker, a Publish / Save as draft / Delete control, and an activity history that refreshes every 5s (rendered as today).
- Routing (our call): `/admin/workflow/<id>` for existing workflows, `/admin/workflow/new` for an unsaved one. This replaces the base64 `?specs=` URL. The old `?specs=` links should still open.
- Delete confirms with a Dialog, not `window.confirm`.

### Setup wizard (`/admin/setup`)

- Step 1: set the admin password. It's bcrypt-hashed in the browser as today, written to `auth.admin`, then the wizard logs in.
- Step 2: health checks (HTTPS, not running as root, storage configured, license/support notes) and the **configuration presets** from `model_setup.js`, ported exactly: the same presets, the same input prompts, and the same config they write.
- Telemetry prompt on leaving step 2, as today.
- **Preset confirmation** (our call): presets replace `connections` and the whole `attribute_mapping`. If the instance already has storages, applying a preset first shows a confirm dialog listing the storages it will replace. What the preset writes is unchanged.

### About

- The release HTML, as today.

## Our calls (decided without the user; easy to revisit)

- **Plain Vite + Svelte 5 SPA, not SvelteKit.** The base path is set at runtime, the app is served by Go, and there's no server-side rendering. SvelteKit's routing and build setup would get in the way. Use a small client-side router.
- **TypeScript, Tailwind v4, and shadcn-svelte's current release for Svelte 5.** Components are added with the shadcn-svelte CLI into the app's source tree.
- **Light and dark mode follow the system setting.**
- **Source location:** a new top-level `admin/` directory (its own `package.json`). The build writes to `public/assets/admin/`, served at `{base}/admin/assets/admin/…`. `public/index.backoffice.html` is replaced with a small template that loads the built entry using relative paths under the existing `<base href>`.
- **Upstream packaging:** the built output in `public/assets/admin/` is committed, the way upstream already commits RxJS and other vendor code. The Go build and the maintainer's workflow need no Node toolchain. Only people changing the admin need `npm`.
- **The old admin code** (`public/assets/pages/adminpage/`, `pages/ctrl_adminpage.js`, `boot/router_backoffice.js`, `boot/ctrl_boot_backoffice.js`) is deleted in the same change once every page has been ported, but only if nothing outside the admin imports it.
- **Tests:** unit tests (Vitest) for the config mapping: storage list ↔ `connections`/`related_backend`/`params`, rename and delete, round-tripping pinned fields, and save merging. Manual end-to-end checks against the local dev instance (`DEBUG=true ./dist/filestash`, port 8334).

## Related, out of scope

- The server-side lookup of `attribute_mapping.params` by a request-supplied label without checking `related_backend` (`handler_auth_idp.go`, `sdk/token.go`) is worth reporting upstream as its own issue. This project doesn't change the backend; it just avoids leaving stale entries behind.

## Left to the builder

- Router choice, store design, file layout inside `admin/`.
- How the generic form renderer maps each `FormElement.type` to a shadcn component. Types seen on the server: `text, password, long_text, long_password, number, boolean, select, enable, hidden, file, image, directory, json, datetime, date, bcrypt, bearer, arraybuffer`. Unknown types fall back to a text input.
- Exact copy, spacing, and icons.
- Whether to keep `.br`/`.gz` precompression for the build output (upstream's `public/Makefile compress`).

## Local dev environment (already set up)

- Build: `go generate ./server/...`, then `go build -overlay <overlay.json> --tags fts5 -o dist/filestash cmd/main.go`. The overlay drops `plg_image_c`, which needs static image libraries missing on macOS. Run from the repo root with `DEBUG=true ./dist/filestash` so `./public` is served from disk.
- Data lives in `dist/data/` (gitignored). The admin test password is in `dist/dev-admin-password.txt`.
