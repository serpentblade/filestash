# Filestash admin console

Svelte 5 single-page app for the Filestash admin console. Source lives here; the build is written to `public/assets/admin/` and loaded by the Go template `public/index.backoffice.html`.

## Commands

Run all of these from `admin/`.

- `npm run dev`: Vite dev server on http://localhost:5173. It proxies API calls to a Filestash server on port 8334, so start one first with `DEBUG=true ./dist/filestash` from the repo root.
- `npm test`: unit tests (Vitest).
- `npm run check`: type-check (svelte-check and tsc).
- `npm run verify`: builds, then runs the build-output guard test.
- `npm run build`: build only.
- `npm run i18n`: rebuilds the English language file from the source (see Translations).

## Build output is committed

`public/assets/admin/` is committed build output. The Go binary embeds `public/`, so after any change under `admin/src` run `npm run verify` and commit the regenerated files with the source change.

## Browser cache

The admin HTML's ETag does not change between dev builds, so the browser may keep serving a stale page. Disable the cache in dev tools or add a query string (for example `?v=2`) when reloading.

## Compressed files

Go's static file server prefers a `.br` or `.gz` sibling when one exists. If you run `public/Makefile compress`, re-run it after every admin rebuild (or delete the compressed files under `public/assets/admin/`), or stale bundles will be served.

## Translations

The admin's language files live in `public/assets/locales/admin/`, separate from the file browser's in `public/assets/locales/`. They use the same format: a flat JSON object whose keys are the English text upper-cased with `_` for spaces (`"DELETE_STORAGE": "Delete storage"`), and `{{VALUE}}` or `{{NAME}}` where a value is inserted.

- `en.json` holds every key with its English text and is built into the bundle.
- `_.json` is the blank template. To add a language, copy it to `<code>.json` (for example `fr.json` or `pt-BR.json`) and fill in the values. Empty values fall back to English.
- At startup the console fetches the browser language's file (`fr-CA.json`, then `fr.json`). If there is none it stays in English.

In the source, fixed text goes through `t("Some text")` from `$lib/i18n`. The argument must be a string literal, because `npm run i18n` reads those literals to rebuild `en.json` and `_.json`. A test fails when the two files are out of date. Run it after adding or changing text.

Names that come from the server (storage types, login methods, form fields, dropdown options, settings sections) use dotted keys: `STORAGE.S3`, `LOGIN_METHOD.LOCAL`, `FIELD.ACCESS_KEY_ID`, `OPTION.GRID`, `SECTION.GENERAL`. A text key never contains a dot, so the two can't collide. Name keys are written by hand in `en.json` (the script keeps them). A name with no entry is shown with the old admin's rule: `access_key_id` becomes "Access Key Id".

Help text under form fields comes from the server plugins as HTML and is not translated here.
