<script lang="ts">
  import { onMount } from "svelte"
  import { Plus } from "@lucide/svelte"
  import { getWorkflows } from "$lib/api/endpoints"
  import { href, navigate } from "$lib/router"
  import { t } from "$lib/i18n"
  import { Badge } from "$lib/components/ui/badge"
  import { Button } from "$lib/components/ui/button"
  import * as Dialog from "$lib/components/ui/dialog"
  import { Input } from "$lib/components/ui/input"
  import { Label } from "$lib/components/ui/label"
  import { Skeleton } from "$lib/components/ui/skeleton"
  import { cn } from "$lib/utils"
  import { formatDate, setPendingNew, type StepSpec, type Workflow } from "./model"

  let workflows = $state<Workflow[] | null>(null)
  let triggers = $state<StepSpec[]>([])
  let failed = $state(false)
  let open = $state(false)
  let name = $state("")

  onMount(async () => {
    try {
      const all = await getWorkflows()
      // published first, then drafts; the sort is stable so server order is kept inside each group
      workflows = [...(all.workflows ?? [])].sort((a, b) => Number(b.published) - Number(a.published))
      triggers = all.triggers
    } catch {
      failed = true
    }
  })

  function create(trigger: string) {
    setPendingNew({ name: name.trim(), published: false, trigger: { name: trigger }, actions: [{ name: "tools/debug" }] })
    open = false
    void navigate("admin/workflow/new")
  }
</script>

<div class="mb-6 flex items-center justify-between">
  <h1 class="text-2xl font-semibold">{t("Workflows")}</h1>
  <Button variant="outline" onclick={() => { name = ""; open = true }} disabled={workflows === null}><Plus /> {t("New workflow")}</Button>
</div>

{#if failed}
  <p class="text-destructive text-sm">{t("Couldn't load the workflows.")}</p>
{:else if workflows === null}
  <Skeleton class="h-24 w-full" />
{:else if workflows.length === 0}
  <button type="button" class="text-muted-foreground hover:bg-muted w-full rounded-lg border border-dashed p-8 text-center" onclick={() => { name = ""; open = true }}>
    {t("Create your first workflow")}
  </button>
{:else}
  <ul class="space-y-3">
    {#each workflows as w (w.id)}
      <li>
        <a
          data-link
          href={href(`admin/workflow/${encodeURIComponent(w.id)}`)}
          class={cn("hover:bg-muted block rounded-lg border p-4 transition-colors", !w.published && "opacity-70")}
        >
          <span class="flex items-baseline gap-2">
            <span class="min-w-0 truncate font-medium">{w.name}</span>
            {#if formatDate(w.updated_at)}<span class="text-muted-foreground text-sm">({formatDate(w.updated_at)})</span>{/if}
            {#if !w.published}<Badge variant="secondary">{t("Draft")}</Badge>{/if}
          </span>
          <span class="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
            <Badge variant="outline">{w.trigger.name}</Badge>
            {#if (w.actions ?? []).length > 0}
              <span aria-hidden="true">→</span>
              {#each w.actions as a, i (i)}<Badge variant="outline">{a.name.split("/")[0]}</Badge>{/each}
            {/if}
          </span>
        </a>
      </li>
    {/each}
  </ul>
{/if}

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{t("New workflow")}</Dialog.Title>
      <Dialog.Description>{t("Name it, then pick what starts it.")}</Dialog.Description>
    </Dialog.Header>
    <div class="space-y-2">
      <Label for="new-workflow-name">{t("Name")}</Label>
      <Input id="new-workflow-name" placeholder={t("Workflow name")} bind:value={name} />
    </div>
    <div class="space-y-2">
      <p class="text-sm font-medium">{t("Trigger")}</p>
      <div class="grid gap-2" role="group" aria-label={t("Trigger")}>
        {#each triggers as trig (trig.name)}
          <Button variant="outline" class="justify-start" onclick={() => create(trig.name)}>
            <span class="[&_svg]:size-4 [&_svg]:fill-current" aria-hidden="true">{@html trig.icon}</span>{trig.title}
          </Button>
        {/each}
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
