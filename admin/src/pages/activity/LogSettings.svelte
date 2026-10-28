<script lang="ts">
  import { onDestroy, onMount } from "svelte"
  import { toast } from "svelte-sonner"
  import { getAdminConfig } from "$lib/api/endpoints"
  import { saveConfig } from "$lib/config/save"
  import { toValues, type Schema } from "$lib/config/schema"
  import { createDraft } from "$lib/draft.svelte"
  import { t } from "$lib/i18n"
  import SaveBar from "$lib/components/SaveBar.svelte"
  import SchemaForm from "$lib/components/SchemaForm.svelte"
  import { Skeleton } from "$lib/components/ui/skeleton"

  let schema = $state<Schema | null>(null)
  let failed = $state(false)
  let saving = $state(false)
  const draft = createDraft<Record<string, unknown>>({})
  onDestroy(draft.dispose)

  async function load() {
    try {
      const admin = await getAdminConfig()
      schema = (admin.log ?? {}) as Schema
      draft.reset((toValues(admin).log ?? {}) as Record<string, unknown>)
    } catch {
      failed = true
    }
  }
  onMount(load)

  async function save() {
    saving = true
    await draft.save(async (v) => {
      try {
        await saveConfig(({ values, connections }) => ({ values: { ...values, log: v }, connections }))
      } catch (err) {
        toast.error(t("Couldn't save: {{VALUE}}", err instanceof Error ? err.message : String(err)))
        throw err
      }
      toast.success(t("Saved"))
    })
    saving = false
  }
</script>

{#if failed}
  <p class="text-destructive text-sm">{t("Couldn't load the log settings.")}</p>
{:else if schema}
  <SchemaForm {schema} bind:values={draft.value} prefix="log." />
  <SaveBar dirty={draft.dirty} {saving} onSave={save} onDiscard={() => draft.reset()} />
{:else}
  <Skeleton class="h-20 w-full" />
{/if}
