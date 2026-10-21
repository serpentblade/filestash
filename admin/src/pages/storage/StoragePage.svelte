<script lang="ts">
  import { onDestroy, onMount } from "svelte"
  import { toast } from "svelte-sonner"
  import PlusIcon from "@lucide/svelte/icons/plus"
  import { getAdminConfig, getBackends, getPublicConfig } from "$lib/api/endpoints"
  import { saveConfig } from "$lib/config/save"
  import { toValues } from "$lib/config/schema"
  import {
    duplicateLabels,
    loadStorage,
    saveStorage,
    validateLabel,
    type Middleware,
    type StorageEntry,
    type StorageState,
  } from "$lib/config/storage"
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

  // Task 10 passes the login-method popup opener; without it "configure" is disabled
  let { onOpenLoginMethod }: { onOpenLoginMethod?: () => void } = $props()

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
  let saving = $state(false)
  // keys of entries the server has in sign-in mode, to warn before their details are dropped
  let savedSignin = $state<Set<string>>(new Set())

  const storage = $derived(draft.value.storage)
  const entries = $derived(storage.entries)
  const dups = $derived(duplicateLabels(entries))
  const current = $derived(entries[selected] as StorageEntry | undefined)
  const othersOf = (i: number) => entries.filter((_, j) => j !== i).map((e) => e.label)

  // Save is blocked while any name is invalid; the message names the card to fix
  const blocked = $derived.by(() => {
    if (dups.size > 0) return `Two storages are named "${[...dups][0]}". Rename one to save.`
    for (let i = 0; i < entries.length; i++) {
      const err = validateLabel(entries[i].label, othersOf(i))
      if (err) return `Storage ${i + 1} (${entries[i].type}): ${err}`
    }
    return ""
  })

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
      const [b, next] = await Promise.all([getBackends(), fetchState()])
      backends = b
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

  async function save() {
    if (blocked) return
    saving = true
    const ok = await draft.save(async (v) => {
      try {
        await saveConfig(({ values }) => {
          const out = saveStorage(withCleanDetails(v.storage), { removeLeftovers: v.removeLeftovers })
          return { values: { ...values, middleware: out.middleware }, connections: out.connections }
        })
      } catch (err) {
        toast.error(`Couldn't save: ${err instanceof Error ? err.message : String(err)}`)
        throw err
      }
      toast.success("Saved")
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
  }

  function discard() {
    draft.reset()
    clamp()
  }

  async function remove(i: number) {
    const label = entries[i].label.trim()
    const ok = await confirm({
      title: `Delete ${label}?`,
      body: "The storage is removed from the login page, along with any connection details stored for it.",
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!ok) return
    draft.value.storage.entries.splice(i, 1)
    clamp()
    await save()
  }

  async function create(entry: StorageEntry) {
    draft.value.storage.entries.push(entry)
    selected = draft.value.storage.entries.length - 1
    await save()
  }
</script>

<div class="flex min-h-full flex-col">
  <h1 class="mb-6 text-2xl font-semibold">Storage</h1>

  {#if status === "loading"}
    <div class="space-y-2" role="status" aria-label="Loading">
      <Skeleton class="h-14 w-full max-w-xs" />
      <Skeleton class="h-14 w-full max-w-xs" />
    </div>
  {:else if status === "failed"}
    <div class="space-y-3">
      <p>Couldn't load the storage settings.</p>
      <Button onclick={load}>Retry</Button>
    </div>
  {:else}
    <div class="grid flex-1 gap-6 md:grid-cols-[18rem_1fr]">
      <div class="space-y-3">
        <LeftoversNotice
          leftovers={storage.leftovers}
          removing={draft.value.removeLeftovers}
          onRemove={() => (draft.value.removeLeftovers = true)}
        />
        <ul class="space-y-2" aria-label="Storages">
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
        <Button variant="outline" class="w-full" aria-label="Add storage" onclick={() => (creating = true)}>
          <PlusIcon />
        </Button>
        <p class="text-muted-foreground text-sm">
          Login method: {storage.method ?? "None"} ·
          <Button variant="link" size="xs" class="h-auto p-0" disabled={!onOpenLoginMethod} onclick={() => onOpenLoginMethod?.()}>
            configure
          </Button>
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
                {onOpenLoginMethod}
                savedSignin={savedSignin.has(current.key)}
              />
              <div class="border-t pt-4">
                <Button variant="destructive" onclick={() => remove(selected)} disabled={saving}>Delete storage</Button>
              </div>
            </div>
          {/key}
        {:else}
          <p class="text-muted-foreground">No storage yet. Use + to add one.</p>
        {/if}
      </div>
    </div>
  {/if}

  <div class="mt-auto">
    <SaveBar dirty={draft.dirty} {saving} error={blocked} onSave={save} onDiscard={discard} />
  </div>
</div>

<CreateStorageDialog
  bind:open={creating}
  {backends}
  method={storage.method}
  {entries}
  onCreate={create}
  {onOpenLoginMethod}
/>
