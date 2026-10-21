<script lang="ts">
  import type { StorageEntry } from "$lib/config/storage"
  import { newKey, nextLabel, validateLabel } from "$lib/config/storage"
  import type { Schema } from "$lib/types"
  import * as Dialog from "$lib/components/ui/dialog"
  import { Button } from "$lib/components/ui/button"
  import { confirm } from "$lib/confirm.svelte"
  import { cn } from "$lib/utils"
  import StorageForm from "./StorageForm.svelte"

  let { open = $bindable(false), backends, method, entries, onCreate, onOpenLoginMethod }: {
    open?: boolean
    backends: Record<string, Schema>
    method: string | null
    entries: StorageEntry[]
    onCreate: (entry: StorageEntry) => void
    onOpenLoginMethod?: () => void
  } = $props()

  let entry = $state<StorageEntry | null>(null)
  let defaultLabel = $state("")

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
    entry = {
      key: entry?.key ?? newKey(),
      original: null,
      type,
      label: keepLabel && entry ? entry.label : label,
      mode: entry?.mode ?? "own",
      details: {},
    }
  }

  function close() {
    open = false
    entry = null
    defaultLabel = ""
  }

  async function requestClose() {
    if (touched) {
      const ok = await confirm({
        title: "Discard this storage?",
        body: "What you entered for the new storage will be lost.",
        confirmLabel: "Discard",
        destructive: true,
      })
      if (!ok) return
    }
    close()
  }

  function create() {
    if (entry === null || invalid) return
    const created = { ...$state.snapshot(entry), label: entry.label.trim() } as StorageEntry
    close()
    onCreate(created)
  }
</script>

<Dialog.Root bind:open={() => open, (v) => (v ? (open = true) : void requestClose())}>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Add storage</Dialog.Title>
      <Dialog.Description>Pick a storage type, then choose how people get in.</Dialog.Description>
    </Dialog.Header>

    <div class="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label="Storage type">
      {#each types as t (t)}
        <Button
          variant="outline"
          aria-pressed={entry?.type === t}
          class={cn(entry?.type === t && "border-primary bg-muted")}
          onclick={() => pick(t)}
        >{t}</Button>
      {/each}
    </div>

    {#if entry}
      <StorageForm
        bind:entry={() => entry!, (v) => (entry = v)}
        {backends}
        {method}
        {otherLabels}
        {onOpenLoginMethod}
      />
    {/if}

    <Dialog.Footer>
      <Button variant="outline" onclick={requestClose}>Cancel</Button>
      <Button onclick={create} disabled={invalid}>Create</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
