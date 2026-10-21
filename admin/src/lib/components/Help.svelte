<script lang="ts">
  import { t } from "$lib/i18n"
  import { marked } from "marked"
  import * as Collapsible from "$lib/components/ui/collapsible"
  import { Button } from "$lib/components/ui/button"

  let { description, class: className = "" }: { description: string; class?: string } = $props()

  // descriptions come from the server's own plugins, so they are trusted
  const html = $derived(marked.parse(description, { async: false }) as string)
</script>

{#if description.length > 140}
  <Collapsible.Root class={className}>
    <Collapsible.Trigger>
      {#snippet child({ props })}
        <Button {...props} variant="link" size="sm" class="h-auto p-0">{t("How to…")}</Button>
      {/snippet}
    </Collapsible.Trigger>
    <Collapsible.Content>
      <div class="help text-muted-foreground mt-2 space-y-2 text-sm">{@html html}</div>
    </Collapsible.Content>
  </Collapsible.Root>
{:else}
  <div class="help text-muted-foreground space-y-2 text-sm {className}">{@html html}</div>
{/if}
