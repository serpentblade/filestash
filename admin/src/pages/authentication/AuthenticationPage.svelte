<script lang="ts">
  import { onDestroy, onMount } from "svelte"
  import { toast } from "svelte-sonner"
  import { getAdminConfig, getAuthMiddlewares, getPublicConfig } from "$lib/api/endpoints"
  import { saveConfig } from "$lib/config/save"
  import { toValues } from "$lib/config/schema"
  import {
    loadStorage,
    mergeIdentity,
    saveStorage,
    setMethod,
    usesSignIn,
    type IdentityProvider,
    type Middleware,
    type StorageState,
  } from "$lib/config/storage"
  import type { Schema } from "$lib/types"
  import { addGuard, href } from "$lib/router"
  import { t, methodName } from "$lib/i18n"
  import { confirm } from "$lib/confirm.svelte"
  import SaveBar from "$lib/components/SaveBar.svelte"
  import SchemaForm from "$lib/components/SchemaForm.svelte"
  import { Button } from "$lib/components/ui/button"
  import { Skeleton } from "$lib/components/ui/skeleton"
  import { methodChangeWarning, methodVariables } from "../storage/method"

  const NOT_PARAMS = ["type", "banner"]

  let status = $state<"loading" | "failed" | "ready">("loading")
  let middlewares = $state<Record<string, Schema>>({})
  let loaded = $state(false)
  // the config as last loaded from the server
  let storage = $state<StorageState | null>(null)

  let method = $state<string | null>(null)
  let paramsByMethod = $state<Record<string, Record<string, any>>>({})
  let saving = $state(false)

  const savedMethod = $derived(storage?.method ?? null)

  // None, then every method the server offers. "admin" protects the admin login itself,
  // so it is only listed while the config uses it. The current method stays listed
  // even when the server's list could not be loaded.
  const methods = $derived([
    ...new Set([
      ...Object.keys(middlewares).filter((m) => m !== "admin" || m === savedMethod),
      ...(savedMethod === null ? [] : [savedMethod]),
    ]),
  ])

  // a method's starting values: what the spec ships with
  function defaults(m: string): Record<string, string> {
    const spec = middlewares[m]
    const out: Record<string, string> = {}
    if (!spec) return out
    for (const [k, v] of Object.entries(toValues(spec))) {
      if (NOT_PARAMS.includes(k) || typeof v !== "string" || v === "") continue
      out[k] = v
    }
    return out
  }
  const baselineFor = (m: string) => (m === savedMethod && storage ? { ...storage.methodParams } : defaults(m))

  function ensure(m: string) {
    if (!paramsByMethod[m]) paramsByMethod[m] = baselineFor(m)
  }

  function resetForm() {
    method = savedMethod
    paramsByMethod = {}
    if (method !== null) ensure(method)
  }

  async function fetchStorage(): Promise<StorageState> {
    const [admin, pub] = await Promise.all([getAdminConfig(), getPublicConfig()])
    return loadStorage(pub.connections ?? [], toValues(admin).middleware as Middleware)
  }

  async function load() {
    status = "loading"
    try {
      const [s, mw] = await Promise.all([
        fetchStorage(),
        getAuthMiddlewares().then(
          (m) => ((loaded = true), m),
          () => ((loaded = false), {}),
        ),
      ])
      middlewares = mw
      storage = s
      resetForm()
      status = "ready"
    } catch {
      status = "failed"
    }
  }
  onMount(load)

  function pick(m: string | null) {
    if (m !== null) ensure(m)
    method = m
  }

  const clean = (p: Record<string, any> | undefined): Record<string, string> =>
    Object.fromEntries(
      Object.entries(p ?? {})
        .filter(([k, v]) => !NOT_PARAMS.includes(k) && v !== null && v !== undefined && v !== "")
        .map(([k, v]) => [k, String(v)]),
    )
  const same = (a: Record<string, string>, b: Record<string, string>) =>
    JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort())

  const methodChanged = $derived(status === "ready" && method !== savedMethod)
  const paramsChanged = $derived(
    status === "ready" && method !== null && !same(clean(paramsByMethod[method]), clean(baselineFor(method))),
  )
  // only the chosen method's values are saved, so typing under another method and
  // switching back is not an edit
  const dirty = $derived(methodChanged || paramsChanged)
  const warning = $derived(storage ? methodChangeWarning(storage, method) : null)
  const variables = $derived(method === null ? [] : methodVariables(middlewares[method]))
  const usedBy = $derived(storage ? usesSignIn(storage).map((e) => e.label.trim()) : [])

  const disposeGuard = addGuard({
    isDirty: () => dirty,
    confirm: () =>
      confirm({
        title: t("Discard unsaved changes?"),
        body: t("You have unsaved changes on this page. Leave without saving?"),
        confirmLabel: t("Discard"),
        destructive: true,
      }),
  })
  onDestroy(disposeGuard)

  // keys changed from the loaded params (null = cleared)
  function editedKeys(m: string, params: Record<string, string>): Record<string, string | null> {
    const base = clean(baselineFor(m))
    const out: Record<string, string | null> = {}
    for (const [k, v] of Object.entries(params)) if (base[k] !== v) out[k] = v
    for (const k of Object.keys(base)) if (!(k in params)) out[k] = null
    return out
  }

  async function save() {
    if (saving || !dirty) return
    const next = method
    const params = next === null ? {} : clean($state.snapshot(paramsByMethod[next]))
    const edited = next !== null && !methodChanged ? editedKeys(next, params) : null
    if (warning) {
      const ok = await confirm({
        title: t("Switch to {{VALUE}}?", methodName(next)),
        body: warning,
        confirmLabel: t("Switch"),
        destructive: next === null || savedMethod === "local",
      })
      if (!ok) return
    }
    saving = true
    try {
      // storages are read fresh from the server here: changing the method rewrites
      // which storages sign in with it, and None drops their stored details
      await saveConfig(({ values, connections }) => {
        const fresh = (values.middleware as Partial<Middleware> | undefined) ?? {}
        const state = setMethod(loadStorage(connections ?? [], fresh as Middleware), next, params)
        const out = saveStorage(state)
        const identity_provider = mergeIdentity(fresh.identity_provider as IdentityProvider | undefined, {
          method: next,
          params,
          edited,
        })
        return {
          values: { ...values, middleware: { ...fresh, ...out.middleware, identity_provider } },
          connections: out.connections,
        }
      })
    } catch (err) {
      toast.error(t("Couldn't save: {{VALUE}}", err instanceof Error ? err.message : String(err)))
      saving = false
      return
    }
    toast.success(t("Saved"))
    try {
      storage = await fetchStorage()
      resetForm()
    } catch {
      // the save went through; keep the form as it was saved
      if (storage) storage = { ...setMethod($state.snapshot(storage) as StorageState, next, params) }
    }
    saving = false
  }
</script>

<div class="flex min-h-full flex-col">
  <h1 class="mb-2 text-2xl font-semibold">{t("Authentication")}</h1>
  <p class="text-muted-foreground mb-6 text-sm">
    {t("How people prove who they are before a storage opens for them. Each storage then chooses whether people sign in with this method or enter their own login.")}
  </p>

  {#if status === "loading"}
    <div class="space-y-2" role="status" aria-label={t("Loading")}>
      <Skeleton class="h-9 w-full max-w-md" />
      <Skeleton class="h-24 w-full max-w-2xl" />
    </div>
  {:else if status === "failed"}
    <div class="space-y-3">
      <p>{t("Couldn't load the authentication settings.")}</p>
      <Button onclick={load}>{t("Retry")}</Button>
    </div>
  {:else}
    <div class="max-w-2xl space-y-6">
      <div class="flex flex-wrap gap-2" role="group" aria-label={t("Login method")}>
        {#each [null, ...methods] as m (m ?? "")}
          <Button
            variant={method === m ? "default" : "outline"}
            aria-pressed={method === m}
            disabled={saving}
            onclick={() => pick(m)}
          >{methodName(m)}</Button>
        {/each}
      </div>

      {#if !loaded}
        <p class="text-muted-foreground text-sm">{t("Couldn't load the available login methods.")}</p>
      {/if}

      {#if method === null}
        <p class="text-muted-foreground text-sm">
          {t("No login method. Each storage asks people for their own connection details.")}
        </p>
      {:else if middlewares[method] && paramsByMethod[method]}
        {#key method}
          <SchemaForm schema={middlewares[method]} bind:values={paramsByMethod[method]} hidden={["type"]} />
        {/key}
        <p class="text-muted-foreground text-sm">
          {t("Available to connection details:")} <code>{variables.join(" ")}</code>
        </p>
      {/if}

      <p class="text-muted-foreground text-sm">
        {#if usedBy.length > 0}
          {t("Storages signing in with {{METHOD}}: {{LABELS}}.", { METHOD: methodName(savedMethod), LABELS: usedBy.join(", ") })}
        {:else}
          {t("No storage signs in with a login method yet.")}
        {/if}
        <a class="underline" data-link href={href("admin/storage")}>{t("Go to Storage")}</a>
      </p>

      {#if warning}
        <p role="status" class="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">{warning}</p>
      {/if}
    </div>
  {/if}

  <div class="mt-auto">
    <SaveBar
      {dirty}
      {saving}
      saveLabel={methodChanged ? t("Switch to {{VALUE}}", methodName(method)) : t("Save")}
      onSave={save}
      onDiscard={resetForm}
    />
  </div>
</div>
