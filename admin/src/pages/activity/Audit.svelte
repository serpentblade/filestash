<script lang="ts">
  import { onDestroy, onMount } from "svelte"
  import { getAudit } from "$lib/api/endpoints"
  import { toValues, type Schema } from "$lib/config/schema"
  import SchemaForm from "$lib/components/SchemaForm.svelte"
  import { t } from "$lib/i18n"
  import { Skeleton } from "$lib/components/ui/skeleton"

  let form = $state<Schema | null>(null)
  let html = $state("")
  let failed = $state(false)
  let values = $state<Record<string, any>>({})
  let timer: ReturnType<typeof setTimeout> | undefined
  let seq = 0
  let ready = $state(false)
  let lastKey = ""

  // form keys carry a `search.` prefix that the API does not take
  function params() {
    const p = new URLSearchParams()
    const walk = (node: Record<string, any>, path: string) => {
      for (const [k, v] of Object.entries(node)) {
        if (v !== null && typeof v === "object") walk(v, path + k + ".")
        else if (v !== null && v !== undefined && v !== "" && v !== false) p.set((path + k).replace(/^search\./, ""), String(v))
      }
    }
    walk($state.snapshot(values), "")
    return p
  }

  async function query(p = new URLSearchParams()) {
    const mine = ++seq
    try {
      const res = await getAudit(p)
      if (mine !== seq) return
      if (form === null) {
        form = res.form
        values = toValues(res.form)
      }
      lastKey = p.toString()
      html = res.render
    } catch {
      if (form === null) failed = true
    }
  }
  onMount(async () => {
    await query()
    ready = true
  })
  onDestroy(() => {
    clearTimeout(timer)
    seq++
  })

  // re-query 1000 ms after the last input
  $effect(() => {
    const p = ready ? params() : null
    clearTimeout(timer)
    if (p === null || p.toString() === lastKey) return
    timer = setTimeout(() => void query(p), 1000)
  })
</script>

{#if failed}
  <p class="text-destructive text-sm">{t("Couldn't load the audit report.")}</p>
{:else if form}
  <div class="space-y-4">
    <SchemaForm schema={form} bind:values />
    <!-- trusted server-plugin HTML, as before -->
    <div>{@html html}</div>
  </div>
{:else}
  <Skeleton class="h-24 w-full" />
{/if}
