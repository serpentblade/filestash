<script lang="ts">
  import { getAdminConfig } from "$lib/api/endpoints"
  import { toValues } from "$lib/config/schema"
  import { parseMethodParams, type Middleware, type StorageState } from "$lib/config/storage"
  import type { Schema } from "$lib/types"
  import * as Dialog from "$lib/components/ui/dialog"
  import { Button } from "$lib/components/ui/button"
  import SchemaForm from "$lib/components/SchemaForm.svelte"
  import { confirm } from "$lib/confirm.svelte"
  import { methodChangeWarning, methodVariables } from "./method"

  let { open = $bindable(false), state: storage, middlewares, blocked = "", onApply }: {
    open?: boolean
    state: StorageState
    middlewares: Record<string, Schema>
    // why the page can't save right now; Save applies and saves, so it is disabled meanwhile
    blocked?: string
    // resolves false to keep the dialog open
    // edited: the keys changed from what the dialog loaded, when the method stays the same
    onApply: (
      method: string | null,
      params: Record<string, string>,
      edited: Record<string, string | null> | null,
    ) => Promise<boolean>
  } = $props()

  const NOT_PARAMS = ["type", "banner"]

  // None, then every method the server offers. "admin" protects the admin login itself,
  // so it is only listed while the config uses it.
  const loaded = $derived(Object.keys(middlewares).length > 0)
  // the current method stays listed even when the server's list could not be loaded
  const methods = $derived([
    ...new Set([
      ...Object.keys(middlewares).filter((m) => m !== "admin" || m === storage.method),
      ...(storage.method === null ? [] : [storage.method]),
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
  // the current method's params as the server has them when the dialog opens; plugins
  // rewrite them at runtime (local users, MFA), so the page-load copy may be stale
  let currentParams = $state<Record<string, string> | null>(null)
  let loading = $state(false)
  const baselineFor = (m: string) =>
    m === storage.method ? { ...(currentParams ?? storage.methodParams) } : defaults(m)

  let method = $state<string | null>(null)
  let paramsByMethod = $state<Record<string, Record<string, any>>>({})

  function ensure(m: string) {
    if (!paramsByMethod[m]) paramsByMethod[m] = baselineFor(m)
  }

  async function freshParams(m: string | null): Promise<Record<string, string> | null> {
    if (m === null) return null
    try {
      const mw = toValues(await getAdminConfig()).middleware as Middleware | undefined
      const type = mw?.identity_provider?.type
      return (type === "" || type === undefined ? null : type) === m ? parseMethodParams(mw?.identity_provider?.params) : null
    } catch {
      return null
    }
  }

  let wasOpen = false
  let opening = 0
  $effect.pre(() => {
    if (open && !wasOpen) {
      const m = storage.method
      const token = ++opening
      method = m
      paramsByMethod = {}
      currentParams = null
      loading = true
      void freshParams(m).then((p) => {
        if (token !== opening) return
        currentParams = p
        loading = false
        if (method !== null) ensure(method)
      })
    }
    if (!open && wasOpen) opening++
    wasOpen = open
  })

  function pick(m: string | null) {
    if (m !== null) ensure(m)
    method = m
  }

  const clean = (p: Record<string, any> | undefined): Record<string, string> =>
    Object.fromEntries(
      Object.entries(p ?? {}).filter(([k, v]) => !NOT_PARAMS.includes(k) && v !== null && v !== undefined && v !== "").map(([k, v]) => [k, String(v)]),
    )
  const same = (a: Record<string, string>, b: Record<string, string>) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort())

  const methodChanged = $derived(method !== storage.method)
  const paramsChanged = $derived(method !== null && !same(clean(paramsByMethod[method]), clean(baselineFor(method))))
  const dirty = $derived(
    methodChanged || Object.keys(paramsByMethod).some((m) => !same(clean(paramsByMethod[m]), clean(baselineFor(m)))),
  )
  const warning = $derived(methodChangeWarning(storage, method))
  const variables = $derived(method === null ? [] : methodVariables(middlewares[method]))

  function close() {
    open = false
  }

  async function requestClose() {
    if (dirty) {
      const ok = await confirm({
        title: "Discard your changes?",
        body: "What you entered for the login method will be lost.",
        confirmLabel: "Discard",
        destructive: true,
      })
      if (!ok) return
    }
    close()
  }

  let busy = $state(false)
  // keys changed from the loaded params (null = cleared)
  function editedKeys(m: string, params: Record<string, string>): Record<string, string | null> {
    const base = clean(baselineFor(m))
    const out: Record<string, string | null> = {}
    for (const [k, v] of Object.entries(params)) if (base[k] !== v) out[k] = v
    for (const k of Object.keys(base)) if (!(k in params)) out[k] = null
    return out
  }

  async function save() {
    if (blocked || loading) return
    const params = method === null ? {} : clean($state.snapshot(paramsByMethod[method]))
    const edited = method !== null && !methodChanged ? editedKeys(method, params) : null
    busy = true
    try {
      if (await onApply(method, params, edited)) close()
    } finally {
      busy = false
    }
  }
</script>

<Dialog.Root bind:open={() => open, (v) => (v ? (open = true) : void requestClose())}>
  <Dialog.Content class="max-h-[90vh] overflow-x-hidden overflow-y-auto sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Login method</Dialog.Title>
      <Dialog.Description>How people prove who they are before a storage opens for them.</Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-wrap gap-2" role="group" aria-label="Login method">
      {#each [null, ...methods] as m (m ?? "")}
        <Button
          variant={method === m ? "default" : "outline"}
          aria-pressed={method === m}
          disabled={loading}
          onclick={() => pick(m)}
        >{m ?? "None"}</Button>
      {/each}
    </div>

    {#if loading}
      <p role="status" class="text-muted-foreground text-sm">Loading…</p>
    {:else if !loaded}
      <p class="text-muted-foreground text-sm">Couldn't load the available login methods.</p>
    {/if}
    {#if method === null}
      <p class="text-muted-foreground text-sm">
        No login method. Each storage asks people for their own connection details.
      </p>
    {:else if middlewares[method] && paramsByMethod[method]}
      {#key method}
        <SchemaForm schema={middlewares[method]} bind:values={paramsByMethod[method]} hidden={["type"]} />
      {/key}
      <p class="text-muted-foreground text-sm">
        Available to connection details: <code>{variables.join(" ")}</code>
      </p>
    {/if}

    {#if warning}
      <p role="status" class="text-sm">{warning}</p>
    {/if}
    {#if blocked}
      <p id="method-blocked" role="alert" class="text-destructive text-sm">{blocked}</p>
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={requestClose}>Cancel</Button>
      <Button onclick={save} disabled={busy || loading || blocked !== "" || !(methodChanged || paramsChanged)}
        aria-describedby={blocked ? "method-blocked" : undefined}>{methodChanged ? `Switch to ${method ?? "None"}` : "Save"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
