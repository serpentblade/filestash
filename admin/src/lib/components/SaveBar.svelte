<script lang="ts">
  import { Button } from "$lib/components/ui/button"
  import { confirm } from "$lib/confirm.svelte"

  let { dirty, onSave, onDiscard, saving = false, saveLabel = "Save", error = "" }: {
    dirty: boolean
    onSave: () => void
    onDiscard: () => void
    saving?: boolean
    saveLabel?: string
    error?: string
  } = $props()

  async function discard() {
    const ok = await confirm({
      title: "Discard changes?",
      body: "Your unsaved changes will be lost.",
      confirmLabel: "Discard",
      destructive: true,
    })
    if (ok) onDiscard()
  }
</script>

{#if dirty || error}
  <div class="bg-background sticky bottom-0 z-10 flex items-center gap-3 border-t px-4 py-3">
    <div class="min-w-0 flex-1 text-sm">
      {#if error}
        <span role="alert" class="text-destructive">{error}</span>
      {:else}
        <span>Unsaved changes</span>
      {/if}
    </div>
    <Button variant="outline" onclick={discard} disabled={saving || !dirty}>Discard</Button>
    <Button onclick={onSave} disabled={saving || error !== ""}>{saving ? "Saving…" : saveLabel}</Button>
  </div>
{/if}
