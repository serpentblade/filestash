<script lang="ts">
  import { isLeaf } from "$lib/config/schema"
  import type { FormElement, Schema } from "$lib/types"
  import * as Collapsible from "$lib/components/ui/collapsible"
  import { Button } from "$lib/components/ui/button"
  import SchemaField from "./SchemaField.svelte"
  import SchemaForm from "./SchemaForm.svelte"
  import Help from "./Help.svelte"
  import { fieldLabel, sectionLabel } from "$lib/i18n"

  let { schema, values = $bindable({}), prefix = "", hidden = [] }: {
    schema: Schema
    values?: Record<string, any>
    prefix?: string
    hidden?: string[]
  } = $props()

  function ensureSections() {
    for (const [key, node] of Object.entries(schema)) {
      if (!hidden.includes(key) && !isLeaf(node) && (typeof values[key] !== "object" || values[key] === null)) values[key] = {}
    }
  }
  ensureSections()
  $effect.pre(ensureSections)

  const entries = $derived(Object.entries(schema).filter(([key]) => !hidden.includes(key)))
  const banner = $derived.by(() => {
    const b = entries.find(([key, node]) => key === "banner" && isLeaf(node))
    return b ? (b[1] as FormElement).description : undefined
  })

  // leaves that an enable element in the same object controls
  const targeted = $derived(
    new Set(
      entries.flatMap(([, node]) => (isLeaf(node) && node.type === "enable" ? (node.target ?? []) : [])),
    ),
  )
  let open = $state<Record<string, boolean>>({})
  const isTargeted = (node: FormElement) => node.id !== undefined && targeted.has(node.id)
  const targetsOf = (el: FormElement) =>
    entries.filter(([, n]) => isLeaf(n) && n.id !== undefined && (el.target ?? []).includes(n.id)) as [string, FormElement][]
</script>

<div class="space-y-4">
  {#if banner}<Help description={banner} />{/if}
  {#each entries as [key, node] (key)}
    {#if isLeaf(node)}
      {#if key === "banner"}
        <!-- rendered above -->
      {:else if node.type === "enable"}
        <Collapsible.Root class="space-y-4" bind:open={() => open[key] ?? false, (v) => (open[key] = v)}>
          <Collapsible.Trigger>
            {#snippet child({ props })}
              <Button {...props} variant="ghost" size="sm" type="button">{node.placeholder || fieldLabel(node.label)}</Button>
            {/snippet}
          </Collapsible.Trigger>
          <Collapsible.Content class="space-y-4">
            {#if open[key]}
              {#each targetsOf(node) as [tkey, tnode] (tkey)}
                <SchemaField el={tnode} name={prefix + tkey} bind:value={values[tkey]} />
              {/each}
            {/if}
          </Collapsible.Content>
        </Collapsible.Root>
      {:else if !isTargeted(node)}
        <SchemaField el={node} name={prefix + key} bind:value={values[key]} />
      {/if}
    {:else}
      <section class="space-y-4">
        <h3 class="text-base font-medium">{sectionLabel(key)}</h3>
        <SchemaForm schema={node} bind:values={values[key]} prefix={prefix + key + "."} />
      </section>
    {/if}
  {/each}
</div>
