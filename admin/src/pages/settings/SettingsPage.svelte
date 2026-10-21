<script lang="ts">
  import { onDestroy, onMount } from "svelte"
  import { toast } from "svelte-sonner"
  import { getAdminConfig } from "$lib/api/endpoints"
  import { saveConfig } from "$lib/config/save"
  import { omit, pick, toValues, type Schema } from "$lib/config/schema"
  import { createDraft } from "$lib/draft.svelte"
  import SaveBar from "$lib/components/SaveBar.svelte"
  import SchemaForm from "$lib/components/SchemaForm.svelte"
  import { Skeleton } from "$lib/components/ui/skeleton"

  // shown elsewhere (log on Activity, middleware and connections on Storage) or setup-only (constant)
  const NOT_HERE = ["constant", "middleware", "log", "connections"]

  let schema = $state<Schema | null>(null)
  let failed = $state(false)
  let saving = $state(false)
  const draft = createDraft<Record<string, any>>({})
  onDestroy(draft.dispose)

  const ownedKeys = $derived(Object.keys(schema ?? {}).filter((k) => !NOT_HERE.includes(k)))

  async function load() {
    try {
      const admin = await getAdminConfig()
      const shown = omit(admin as Record<string, unknown>, NOT_HERE) as Schema
      schema = shown
      const initial = toValues(shown)
      loadedHash = (initial.auth as Record<string, unknown> | undefined)?.admin
      draft.reset(initial)
    } catch {
      failed = true
    }
  }
  onMount(load)

  // never overwrite the admin password hash unless the user edited that field
  let loadedHash: unknown
  const adminHash = (v: Record<string, any>) => v.auth?.admin
  const untouched = (h: unknown) => h === loadedHash || h === null || h === undefined || h === ""

  async function save() {
    saving = true
    await draft.save(async (v) => {
      try {
        await saveConfig(({ values, connections }) => {
          const owned = pick(v, ownedKeys)
          if (owned.auth && untouched(adminHash(v))) {
            const fresh = (values.auth as Record<string, unknown> | undefined)?.admin
            owned.auth = { ...(owned.auth as object), admin: fresh }
          }
          return { values: { ...values, ...owned }, connections }
        })
      } catch (err) {
        toast.error(`Couldn't save: ${err instanceof Error ? err.message : String(err)}`)
        throw err
      }
      toast.success("Saved")
      loadedHash = adminHash(v)
    })
    saving = false
  }
</script>

<h1 class="mb-6 text-2xl font-semibold">Settings</h1>
{#if failed}
  <p class="text-destructive text-sm">Couldn't load the settings.</p>
{:else if schema}
  <SchemaForm {schema} bind:values={draft.value} />
  <SaveBar dirty={draft.dirty} {saving} onSave={save} onDiscard={() => draft.reset()} />
{:else}
  <Skeleton class="h-40 w-full" />
{/if}
