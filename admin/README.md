# Filestash admin console

Svelte 5 single-page app for the Filestash admin console. Source lives here; the build is written to `public/assets/admin/` and loaded by the Go template `public/index.backoffice.html`.

## Commands

Run all of these from `admin/`.

- `npm run dev`: Vite dev server on http://localhost:5173. It proxies API calls to a Filestash server on port 8334, so start one first with `DEBUG=true ./dist/filestash` from the repo root.
- `npm test`: unit tests (Vitest).
- `npm run check`: type-check (svelte-check and tsc).
- `npm run verify`: builds, then runs the build-output guard test.
- `npm run build`: build only.

## Build output is committed

`public/assets/admin/` is committed build output. The Go binary embeds `public/`, so after any change under `admin/src` run `npm run verify` and commit the regenerated files with the source change.

## Browser cache

The admin HTML's ETag does not change between dev builds, so the browser may keep serving a stale page. Disable the cache in dev tools or add a query string (for example `?v=2`) when reloading.

## Compressed files

Go's static file server prefers a `.br` or `.gz` sibling when one exists. If you run `public/Makefile compress`, re-run it after every admin rebuild (or delete the compressed files under `public/assets/admin/`), or stale bundles will be served.
