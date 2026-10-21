<script lang="ts">
  import { t } from "$lib/i18n"
  import type { Leftovers } from "$lib/config/storage"
  import { Button } from "$lib/components/ui/button"
  import { confirm } from "$lib/confirm.svelte"

  let { leftovers, method, removing, onRemove }: {
    leftovers: Leftovers
    // with no login method, any save drops them
    method: string | null
    removing: boolean
    onRemove: () => void
  } = $props()

  const count = $derived(leftovers.relatedLabels.length + leftovers.paramKeys.length)

  async function remove() {
    const ok = await confirm({
      title: t("Remove leftovers?"),
      body: t("These settings don't belong to any storage. They will be deleted when you save."),
      confirmLabel: t("Remove"),
      destructive: true,
    })
    if (ok) onRemove()
  }
</script>

{#if count > 0}
  <div class="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
    <p class="font-medium">
      {count === 1
        ? t("1 leftover setting from an older configuration")
        : t("{{VALUE}} leftover settings from an older configuration", count)}
    </p>
    <details>
      <summary class="cursor-pointer">{t("Details")}</summary>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        {#each leftovers.relatedLabels as l, i (i)}
          <li>{t("Sign-in entry \"{{VALUE}}\"", l)} (<code>related_backend</code>)</li>
        {/each}
        {#each leftovers.paramKeys as k (k)}
          <li>{t("Stored connection details for \"{{VALUE}}\"", k)} (<code>attribute_mapping.params</code>)</li>
        {/each}
      </ul>
    </details>
    {#if method === null}
      <p>{t("These will be removed when you save, because no login method is set.")}</p>
    {:else if removing}
      <p>{t("They will be removed when you save.")}</p>
    {:else}
      <Button variant="outline" size="sm" onclick={remove}>{t("Remove leftovers")}</Button>
    {/if}
  </div>
{/if}
