<script lang="ts">
  import { onDestroy, onMount } from "svelte"
  import { get } from "svelte/store"
  import { toast } from "svelte-sonner"
  import { ArrowLeft } from "@lucide/svelte"
  import { deleteWorkflow, getWorkflow, getWorkflows, upsertWorkflow } from "$lib/api/endpoints"
  import { ApiError } from "$lib/api/http"
  import { confirm } from "$lib/confirm.svelte"
  import { createDraft } from "$lib/draft.svelte"
  import { poll, handlePollError } from "$lib/hooks/poll"
  import { href, navigate, route } from "$lib/router"
  import SaveBar from "$lib/components/SaveBar.svelte"
  import { Button } from "$lib/components/ui/button"
  import { Input } from "$lib/components/ui/input"
  import { Label } from "$lib/components/ui/label"
  import * as Select from "$lib/components/ui/select"
  import { Skeleton } from "$lib/components/ui/skeleton"
  import { Switch } from "$lib/components/ui/switch"
  import { cleanParams, decodeLegacySpecs, formatHistory, newWorkflowId, takePendingNew, type Step, type StepSpec, type Workflow } from "./model"
  import StepCard from "./StepCard.svelte"

  type Item = { key: string; name: string; values: Record<string, any> }
  type Edit = { name: string; published: boolean; trigger: { name: string; values: Record<string, any> }; actions: Item[] }

  const blank = (): Edit => ({ name: "", published: false, trigger: { name: "", values: {} }, actions: [] })

  const current = get(route)
  const existingId = current?.name === "workflow-edit" ? (current.params.id ?? null) : null
  const isNew = existingId === null
  const newId = newWorkflowId()

  let counter = 0
  const nextKey = () => `a${counter++}`
  const fresh = new Set<string>()

  let triggers = $state<StepSpec[]>([])
  let actions = $state<StepSpec[]>([])
  let status = $state<"loading" | "ready" | "failed" | "missing">("loading")
  let saving = $state(false)
  let history = $state("...")
  let dragKey = $state<string | null>(null)

  const draft = createDraft<Edit>(blank())
  let stopPoll: (() => void) | undefined
  onDestroy(() => {
    draft.dispose()
    stopPoll?.()
  })

  const toEdit = (w: Partial<Workflow>): Edit => ({
    name: w.name ?? "",
    published: Boolean(w.published),
    trigger: { name: w.trigger?.name ?? "", values: { ...w.trigger?.params } },
    actions: (w.actions ?? []).map((a) => ({ key: nextKey(), name: a.name, values: { ...a.params } })),
  })

  const toStep = (name: string, values: Record<string, any>): Step => {
    const params = cleanParams(values)
    return params ? { name, params } : { name }
  }

  const toWorkflow = (v: Edit, id: string): Workflow => ({
    id,
    name: v.name.trim(),
    published: v.published,
    trigger: toStep(v.trigger.name, v.trigger.values),
    actions: v.actions.map((a) => toStep(a.name, a.values)),
  })

  onMount(async () => {
    try {
      const [all, existing] = await Promise.all([getWorkflows(), existingId === null ? null : getWorkflow(existingId)])
      triggers = all.triggers
      actions = all.actions
      if (existing) {
        draft.reset(toEdit(existing))
        history = formatHistory(existing.history ?? [])
      } else {
        const specs = current?.params.specs
        const start = takePendingNew() ?? (specs ? decodeLegacySpecs(specs) : null)
        if (!start) {
          void navigate("admin/workflow", { replace: true })
          return
        }
        // a new workflow starts unsaved, so leaving it asks first
        draft.value = toEdit(start)
      }
      status = "ready"
      if (existingId !== null) {
        stopPoll = poll(
          async () => {
            history = formatHistory((await getWorkflow(existingId)).history ?? [])
          },
          5000,
          () => false,
          (err) => handlePollError(err, () => {}),
        )
      }
    } catch (err) {
      status = existingId !== null && err instanceof ApiError && err.status === 404 ? "missing" : "failed"
    }
  })

  async function save() {
    if (draft.value.name.trim() === "") {
      toast.error("Give the workflow a name")
      return
    }
    const id = existingId ?? newId
    saving = true
    const ok = await draft.save(async (v) => {
      try {
        await upsertWorkflow(toWorkflow($state.snapshot(v) as Edit, id))
      } catch (err) {
        toast.error(`Couldn't save: ${err instanceof Error ? err.message : String(err)}`)
        throw err
      }
    })
    saving = false
    if (!ok) return
    toast.success("Saved")
    if (isNew) void navigate(`admin/workflow/${encodeURIComponent(id)}`, { replace: true })
  }

  async function remove() {
    if (existingId === null) return
    const ok = await confirm({
      title: `Delete ${draft.value.name || "this workflow"}?`,
      body: "This workflow will be removed.",
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteWorkflow(existingId)
    } catch (err) {
      toast.error(`Couldn't delete: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    toast.success("Deleted")
    draft.reset()
    void navigate("admin/workflow")
  }

  function addAction(name: string) {
    if (!name) return
    const key = nextKey()
    fresh.add(key)
    draft.value.actions.push({ key, name, values: {} })
  }

  function removeAction(key: string) {
    draft.value.actions = draft.value.actions.filter((a) => a.key !== key)
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= draft.value.actions.length || from === to) return
    const list = [...draft.value.actions]
    const [item] = list.splice(from, 1)
    list.splice(to, 0, item)
    draft.value.actions = list
  }

  function dragOver(e: DragEvent, key: string, el: HTMLElement) {
    if (dragKey === null || dragKey === key) return
    e.preventDefault()
    const list = draft.value.actions
    const from = list.findIndex((a) => a.key === dragKey)
    const to = list.findIndex((a) => a.key === key)
    const rect = el.getBoundingClientRect()
    const below = e.clientY > rect.top + rect.height / 2
    if ((from < to && below) || (from > to && !below)) move(from, to)
  }

  const triggerSpec = $derived(triggers.find((t) => t.name === draft.value.trigger.name))
  const specFor = (name: string) => actions.find((a) => a.name === name)
</script>

{#if status === "loading"}
  <Skeleton class="h-40 w-full" />
{:else if status === "failed"}
  <p class="text-destructive text-sm">Couldn't load the workflow.</p>
{:else if status === "missing"}
  <h1 class="text-2xl font-semibold">Workflow not found</h1>
  <a class="mt-2 inline-block underline" data-link href={href("admin/workflow")}>Back to Workflows</a>
{:else}
  <div class="mb-6 flex flex-wrap items-center gap-3">
    <Button variant="ghost" size="icon" aria-label="Back to workflows" href={href("admin/workflow")} data-link><ArrowLeft /></Button>
    <Label for="workflow-name" class="sr-only">Workflow name</Label>
    <Input id="workflow-name" class="min-w-48 flex-1 text-lg font-semibold" placeholder="Workflow name" bind:value={draft.value.name} />
    <div class="flex items-center gap-2">
      <Switch id="workflow-published" checked={draft.value.published} onCheckedChange={(c) => (draft.value.published = c)} />
      <Label for="workflow-published">{draft.value.published ? "Published" : "Draft"}</Label>
    </div>
    {#if !isNew}
      <Button variant="destructive" onclick={remove}>Delete</Button>
    {/if}
  </div>

  <div class="space-y-3">
    <StepCard
      name={draft.value.trigger.name}
      spec={triggerSpec}
      bind:values={draft.value.trigger.values}
      open={isNew}
      prefix="trigger-"
    />
    {#each draft.value.actions as a, i (a.key)}
      <StepCard
        name={a.name}
        spec={specFor(a.name)}
        bind:values={draft.value.actions[i].values}
        open={isNew || fresh.has(a.key)}
        prefix="{a.key}-"
        dragging={dragKey === a.key}
        canMoveUp={i > 0}
        canMoveDown={i < draft.value.actions.length - 1}
        onMove={(d) => move(i, i + d)}
        onRemove={() => removeAction(a.key)}
        onDragStart={() => (dragKey = a.key)}
        onDragOver={(e, el) => dragOver(e, a.key, el)}
        onDragEnd={() => (dragKey = null)}
      />
    {/each}

    <Select.Root type="single" bind:value={() => "", (v) => addAction(v)}>
      <Select.Trigger class="w-56" aria-label="Add action">Add action</Select.Trigger>
      <Select.Content>
        {#each actions as spec (spec.name)}
          <Select.Item value={spec.name} label={spec.name}>{spec.title}<span class="text-muted-foreground ml-1 text-xs">{spec.name}</span></Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>

  {#if !isNew}
    <h2 class="mt-8 mb-2 text-lg font-semibold">Activity</h2>
    <pre class="bg-muted max-h-72 overflow-auto rounded-lg p-3 text-xs" aria-label="Workflow activity">{history}</pre>
  {/if}

  <SaveBar dirty={draft.dirty} {saving} onSave={save} onDiscard={() => draft.reset()} />
{/if}
