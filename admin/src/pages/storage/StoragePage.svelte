<script lang="ts">
  import { onDestroy, onMount } from "svelte"
  import { toast } from "svelte-sonner"
  import PlusIcon from "@lucide/svelte/icons/plus"
  import { getAdminConfig, getAuthMiddlewares, getBackends, getPublicConfig } from "$lib/api/endpoints"
  import { saveConfig } from "$lib/config/save"
  import { toValues } from "$lib/config/schema"
  import {
    duplicateLabels,
    loadStorage,
    mergeIdentity,
    saveStorage,
    validateLabel,
    type IdentityProvider,
    type Middleware,
    type StorageEntry,
    type StorageState,
  } from "$lib/config/storage"
  import { href } from "$lib/router"
  import { t, storageName, methodName } from "$lib/i18n"
  import { createDraft } from "$lib/draft.svelte"
  import { confirm } from "$lib/confirm.svelte"
  import type { Schema } from "$lib/types"
  import SaveBar from "$lib/components/SaveBar.svelte"
  import { Button } from "$lib/components/ui/button"
  import { Skeleton } from "$lib/components/ui/skeleton"
  import StorageCard from "./StorageCard.svelte"
  import StorageForm from "./StorageForm.svelte"
  import CreateStorageDialog from "./CreateStorageDialog.svelte"
  import LeftoversNotice from "./LeftoversNotice.svelte"
  import { methodVariables } from "./method"

  type Draft = { storage: StorageState; removeLeftovers: boolean }

  const emptyMiddleware: Middleware = {
    identity_provider: { type: null, params: "" },
    attribute_mapping: { related_backend: "", params: "" },
  }

  const draft = createDraft<Draft>({ storage: loadStorage([], emptyMiddleware), removeLeftovers: false })
  onDestroy(draft.dispose)

  let backends = $state<Record<string, Schema>>({})
  let status = $state<"loading" | "failed" | "ready">("loading")
  let selected = $state(0)
  let creating = $state(false)
  let middlewares = $state<Record<string, Schema>>({})
  let saving = $state(false)
  // keys of entries the server has in sign-in mode, to warn before their details are dropped
  let savedSignin = $state<Set<string>>(new Set())

  const storage = $derived(draft.value.storage)
  const entries = $derived(storage.entries)
  const variables = $derived(methodVariables(storage.method === null ? undefined : middlewares[storage.method]))
  const dups = $derived(duplicateLabels(entries))
  const current = $derived(entries[selected] as StorageEntry | undefined)
  const othersOf = (i: number) => entries.filter((_, j) => j !== i).map((e) => e.label)

  // Save is blocked while any name is invalid; the message names the card to fix
  function blockReason(list: StorageEntry[]): string {
    const d = duplicateLabels(list)
    if (d.size > 0) return t("Two storages are named \"{{NAME}}\". Rename one to save.", { NAME: [...d][0] })
    for (let i = 0; i < list.length; i++) {
      const others = list.filter((_, j) => j !== i).map((e) => e.label)
      const err = validateLabel(list[i].label, others)
      if (err) return t("Storage {{NUMBER}} ({{TYPE}}): {{ERROR}}", { NUMBER: i + 1, TYPE: storageName(list[i].type), ERROR: err })
    }
    return ""
  }
  const blocked = $derived(blockReason(entries))
  // deleting saves, so it is allowed while blocked only if removing the entry clears the block
  const deleteBlocked = $derived(blocked && blockReason(entries.filter((_, j) => j !== selected)))

    async function fetchState(): Promise<Draft> {
    const [admin, pub] = await Promise.all([getAdminConfig(), getPublicConfig()])
    const mw = toValues(admin).middleware as Middleware
    return { storage: loadStorage(pub.connections ?? [], mw), removeLeftovers: false }
  }

  function adopt(next: Draft) {
    savedSignin = new Set(next.storage.entries.filter((e) => e.mode === "signin").map((e) => e.key))
  }

  async function load() {
    status = "loading"
    try {
      // the login methods only feed the picker and the variables hint, so the page loads without them
      const [b, next, mw] = await Promise.all([getBackends(), fetchState(), getAuthMiddlewares().catch(() => ({}))])
      backends = b
      middlewares = mw
      adopt(next)
      draft.reset(next)
      selected = 0
      status = "ready"
    } catch {
      status = "failed"
    }
  }
  onMount(load)

  const clamp = () => (selected = Math.max(0, Math.min(selected, draft.value.storage.entries.length - 1)))

  // cleared form fields bind null; they are left out of the stored details
  const withCleanDetails = (s: StorageState): StorageState => ({
    ...s,
    entries: s.entries.map((e) => ({
      ...e,
      details: Object.fromEntries(Object.entries(e.details).filter(([, v]) => v !== null && v !== undefined)),
    })),
  })

  // the identity provider is only edited on the Authentication page; storage saves keep
  // the server's as it is now, since plugins rewrite its params at runtime
  async function save(): Promise<boolean> {
    if (blocked) return false
    saving = true
    const ok = await draft.save(async (v) => {
      try {
        await saveConfig(({ values }) => {
          const out = saveStorage(withCleanDetails(v.storage), { removeLeftovers: v.removeLeftovers })
          const fresh = (values.middleware as Partial<Middleware> | undefined) ?? {}
          const identity_provider = mergeIdentity(
            (fresh.identity_provider as IdentityProvider | undefined) ?? out.middleware.identity_provider,
            null,
          )
          const middleware = { ...fresh, ...out.middleware, identity_provider }
          return { values: { ...values, middleware }, connections: out.connections }
        })
      } catch (err) {
        toast.error(t("Couldn't save: {{VALUE}}", err instanceof Error ? err.message : String(err)))
        throw err
      }
      toast.success(t("Saved"))
      try {
        const next = await fetchState()
        adopt(next)
        return next
      } catch {
        return undefined
      }
    })
    saving = false
    if (ok) clamp()
    return ok
  }

  function discard() {
    draft.reset()
    clamp()
  }

  async function remove(i: number) {
    const label = entries[i].label.trim()
    const body = t("The storage is removed from the login page, along with any connection details stored for it.")
    const ok = await confirm({
      title: t("Delete {{VALUE}}?", label),
      body: draft.dirty ? `${body} ${t("This also saves your other unsaved changes.")}` : body,
      confirmLabel: t("Delete"),
      destructive: true,
    })
    if (!ok) return
    draft.value.storage.entries.splice(i, 1)
    clamp()
    await save()
  }

  // false keeps the create dialog open
  async function create(entry: StorageEntry): Promise<boolean> {
    if (blocked) return false
    if (draft.dirty) {
      const ok = await confirm({
        title: t("Save other changes too?"),
        body: `${t("Creating the storage saves the page.")} ${t("This also saves your other unsaved changes.")}`,
        confirmLabel: t("Save all"),
      })
      if (!ok) return false
    }
    draft.value.storage.entries.push(entry)
    selected = draft.value.storage.entries.length - 1
    void save()
    return true
  }
</script>

<div class="flex min-h-full flex-col">
  <h1 class="mb-6 text-2xl font-semibold">{t("Storage")}</h1>

  {#if status === "loading"}
    <div class="space-y-2" role="status" aria-label={t("Loading")}>
      <Skeleton class="h-14 w-full max-w-xs" />
      <Skeleton class="h-14 w-full max-w-xs" />
    </div>
  {:else if status === "failed"}
    <div class="space-y-3">
      <p>{t("Couldn't load the storage settings.")}</p>
      <Button onclick={load}>{t("Retry")}</Button>
    </div>
  {:else}
    <div class="grid flex-1 gap-6 md:grid-cols-[18rem_1fr]">
      <div class="space-y-3">
        <LeftoversNotice
          leftovers={storage.leftovers}
          method={storage.method}
          removing={draft.value.removeLeftovers}
          onRemove={() => (draft.value.removeLeftovers = true)}
        />
        <ul class="space-y-2" aria-label={t("Storages")}>
          {#each entries as entry, i (entry.key)}
            <li>
              <StorageCard
                {entry}
                method={storage.method}
                selected={i === selected}
                duplicate={dups.has(entry.label.trim())}
                onselect={() => (selected = i)}
              />
            </li>
          {/each}
        </ul>
        <Button variant="outline" class="w-full" aria-label={t("Add storage")} disabled={saving}
          onclick={() => (creating = true)}>
          <PlusIcon />
        </Button>
        <p class="text-muted-foreground text-sm">
          {t("Login method: {{VALUE}}", methodName(storage.method))} ·
          <a class="underline" data-link href={href("admin/authentication")}>{t("change")}</a>
        </p>
      </div>

      <div class="min-w-0">
        {#if current}
          {#key current.key}
            <div class="max-w-2xl space-y-8">
              <StorageForm
                bind:entry={draft.value.storage.entries[selected]}
                {backends}
                method={storage.method}
                otherLabels={othersOf(selected)}
                {variables}
                savedSignin={savedSignin.has(current.key)}
              />
              <div class="border-t pt-4">
                <Button variant="destructive" onclick={() => remove(selected)} disabled={saving || deleteBlocked !== ""}
                  aria-describedby={deleteBlocked ? "delete-blocked" : undefined}>{t("Delete storage")}</Button>
                {#if deleteBlocked}
                  <p id="delete-blocked" class="text-muted-foreground mt-2 text-sm">{deleteBlocked}</p>
                {/if}
              </div>
            </div>
          {/key}
        {:else}
          <p class="text-muted-foreground">{t("No storage yet. Use + to add one.")}</p>
        {/if}
      </div>
    </div>
  {/if}

  <div class="mt-auto">
    <SaveBar dirty={draft.dirty} {saving} error={blocked} onSave={() => save()} onDiscard={discard} />
  </div>
</div>

<CreateStorageDialog
  bind:open={creating}
  {backends}
  method={storage.method}
  {entries}
  {blocked}
  {saving}
  onCreate={create}
  {variables}
/>
