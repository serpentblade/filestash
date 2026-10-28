<script lang="ts">
  import { t } from "$lib/i18n"
  import { Button } from "$lib/components/ui/button"
  import { confirm } from "$lib/confirm.svelte"

  let { dirty, onSave, onDiscard, saving = false, saveLabel = "", error = "" }: {
    dirty: boolean
    onSave: () => void
    onDiscard: () => void
    saving?: boolean
    saveLabel?: string
    error?: string
  } = $props()

  async function discard() {
    const ok = await confirm({
      title: t("Discard changes?"),
      body: t("Your unsaved changes will be lost."),
      confirmLabel: t("Discard"),
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
        <span>{t("Unsaved changes")}</span>
      {/if}
    </div>
    <Button variant="outline" onclick={discard} disabled={saving || !dirty}>{t("Discard")}</Button>
    <Button onclick={onSave} disabled={saving || error !== ""}>{saving ? t("Saving…") : saveLabel || t("Save")}</Button>
  </div>
{/if}
