<script lang="ts">
  import type { Leftovers } from "$lib/config/storage"
  import { Button } from "$lib/components/ui/button"
  import { confirm } from "$lib/confirm.svelte"

  let { leftovers, removing, onRemove }: {
    leftovers: Leftovers
    removing: boolean
    onRemove: () => void
  } = $props()

  const count = $derived(leftovers.relatedLabels.length + leftovers.paramKeys.length)

  async function remove() {
    const ok = await confirm({
      title: "Remove leftovers?",
      body: "These settings don't belong to any storage. They will be deleted when you save.",
      confirmLabel: "Remove",
      destructive: true,
    })
    if (ok) onRemove()
  }
</script>

{#if count > 0}
  <div class="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
    <p class="font-medium">
      {count} leftover {count === 1 ? "setting" : "settings"} from an older configuration
    </p>
    <details>
      <summary class="cursor-pointer">Details</summary>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        {#each leftovers.relatedLabels as l, i (i)}
          <li>Sign-in entry "{l}" (<code>related_backend</code>)</li>
        {/each}
        {#each leftovers.paramKeys as k (k)}
          <li>Stored connection details for "{k}" (<code>attribute_mapping.params</code>)</li>
        {/each}
      </ul>
    </details>
    {#if removing}
      <p>They will be removed when you save.</p>
    {:else}
      <Button variant="outline" size="sm" onclick={remove}>Remove leftovers</Button>
    {/if}
  </div>
{/if}
