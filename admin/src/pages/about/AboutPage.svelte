<script lang="ts">
  import { onMount } from "svelte"
  import Loader2Icon from "@lucide/svelte/icons/loader-2"
  import { getRelease } from "$lib/api/endpoints"
  import { Button } from "$lib/components/ui/button"

  let html = $state<string | null>(null)
  let failed = $state(false)

  async function load() {
    failed = false
    try {
      html = (await getRelease()).html
    } catch {
      failed = true
    }
  }

  onMount(() => void load())
</script>

<div class="space-y-4">
  <h1 class="text-2xl font-semibold">About</h1>
  {#if failed}
    <div class="flex flex-col items-start gap-3" role="alert">
      <p>Could not load the release information</p>
      <Button onclick={load}>Retry</Button>
    </div>
  {:else if html === null}
    <div role="status" aria-label="Loading"><Loader2Icon class="size-6 animate-spin" /></div>
  {:else}
    <div data-testid="release" class="overflow-x-auto">{@html html}</div>
  {/if}
</div>
