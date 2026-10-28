<script lang="ts">
  import { t, storageName } from "$lib/i18n"
  import { onDestroy } from "svelte"
  import { addGuard } from "$lib/router"
  import type { StorageEntry } from "$lib/config/storage"
  import { newKey, nextLabel, validateLabel } from "$lib/config/storage"
  import type { Schema } from "$lib/types"
  import * as Dialog from "$lib/components/ui/dialog"
  import { Button } from "$lib/components/ui/button"
  import { confirm } from "$lib/confirm.svelte"
  import { cn } from "$lib/utils"
  import StorageForm from "./StorageForm.svelte"

  let { open = $bindable(false), backends, method, entries, blocked = "", saving = false, onCreate, variables }: {
    open?: boolean
    backends: Record<string, Schema>
    method: string | null
    entries: StorageEntry[]
    // why the page can't save right now; Create saves, so it is disabled meanwhile
    blocked?: string
    // a page save is in flight
    saving?: boolean
    // resolves false to keep the dialog open
    onCreate: (entry: StorageEntry) => Promise<boolean>
    variables?: string[]
  } = $props()

  let entry = $state<StorageEntry | null>(null)
  let defaultLabel = $state("")
  // what was typed for each type, so switching type and back restores it
  let detailsByType: Record<string, Record<string, string>> = {}

  const types = $derived(Object.keys(backends).sort())
  const otherLabels = $derived(entries.map((e) => e.label))
  const invalid = $derived(entry === null || validateLabel(entry.label, otherLabels) !== null)
  const touched = $derived(
    entry !== null &&
      (entry.label !== defaultLabel ||
        entry.mode !== "own" ||
        Object.values(entry.details).some((v) => v !== null && v !== undefined && v !== "")),
  )

  function pick(type: string) {
    const keepLabel = entry !== null && entry.label !== defaultLabel
    const label = nextLabel(type, entries)
    defaultLabel = label
    if (entry !== null) detailsByType[entry.type] = { ...$state.snapshot(entry.details) }
    entry = {
      key: entry?.key ?? newKey(),
      original: null,
      type,
      label: keepLabel && entry ? entry.label : label,
      mode: entry?.mode ?? "own",
      details: { ...(detailsByType[type] ?? {}) },
    }
  }

  function close() {
    open = false
    entry = null
    defaultLabel = ""
    detailsByType = {}
  }

  async function requestClose() {
    if (touched) {
      const ok = await confirm({
        title: t("Discard this storage?"),
        body: t("What you entered for the new storage will be lost."),
        confirmLabel: t("Discard"),
        destructive: true,
      })
      if (!ok) return
    }
    close()
  }

  // the "Set up a login method first" link leaves the page; ask before losing what was typed
  const disposeGuard = addGuard({
    isDirty: () => open && touched,
    confirm: () =>
      confirm({
        title: t("Discard this storage?"),
        body: t("What you entered for the new storage will be lost."),
        confirmLabel: t("Discard"),
        destructive: true,
      }),
  })
  onDestroy(disposeGuard)

  let busy = $state(false)
  async function create() {
    if (entry === null || invalid || blocked || saving) return
    const created = { ...$state.snapshot(entry), label: entry.label.trim() } as StorageEntry
    busy = true
    try {
      if (await onCreate(created)) close()
    } finally {
      busy = false
    }
  }
</script>

<Dialog.Root bind:open={() => open, (v) => (v ? (open = true) : void requestClose())}>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>{t("Add storage")}</Dialog.Title>
      <Dialog.Description>{t("Pick a storage type, then choose how people get in.")}</Dialog.Description>
    </Dialog.Header>

    <div class="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label={t("Storage type")}>
      {#each types as type (type)}
        <Button
          variant="outline"
          aria-pressed={entry?.type === type}
          class={cn(entry?.type === type && "border-primary bg-muted")}
          onclick={() => pick(type)}
        >{storageName(type)}</Button>
      {/each}
    </div>

    {#if entry}
      <StorageForm
        bind:entry={() => entry!, (v) => (entry = v)}
        {backends}
        {method}
        {otherLabels}
        {variables}
      />
    {/if}

    {#if blocked}
      <p id="create-blocked" role="alert" class="text-destructive text-sm">{blocked}</p>
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={requestClose}>{t("Cancel")}</Button>
      <Button onclick={create} disabled={invalid || busy || saving || blocked !== ""}
        aria-describedby={blocked ? "create-blocked" : undefined}>{t("Create")}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
