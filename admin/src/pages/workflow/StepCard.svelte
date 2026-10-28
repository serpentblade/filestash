<script lang="ts">
  import { ChevronDown, ChevronUp, GripVertical, Settings2, X } from "@lucide/svelte"
  import type { StepSpec } from "./model"
  import SchemaForm from "$lib/components/SchemaForm.svelte"
  import { Button } from "$lib/components/ui/button"
  import * as Card from "$lib/components/ui/card"
  import { cn } from "$lib/utils"

  let { name, spec, values = $bindable({}), open = false, prefix, onRemove, onMove, canMoveUp = false, canMoveDown = false, dragging = false, onDragStart, onDragOver, onDragEnd }: {
    name: string
    spec?: StepSpec
    values?: Record<string, any>
    open?: boolean
    prefix: string
    onRemove?: () => void
    onMove?: (delta: -1 | 1) => void
    canMoveUp?: boolean
    canMoveDown?: boolean
    dragging?: boolean
    onDragStart?: () => void
    onDragOver?: (e: DragEvent, el: HTMLElement) => void
    onDragEnd?: () => void
  } = $props()

  // svelte-ignore state_referenced_locally
  let expanded = $state(open)
  let card = $state<HTMLElement>()

  const configurable = $derived(spec !== undefined && Object.keys(spec.specs).length > 0)
  const detail = $derived(spec?.subtitle && values[spec.subtitle] ? `(${values[spec.subtitle]})` : "")
  const label = $derived(spec?.title ?? name)

  function dragStart(e: DragEvent) {
    if (e.dataTransfer && card) {
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/plain", name)
      e.dataTransfer.setDragImage(card, 16, 16)
    }
    onDragStart?.()
  }
</script>

<div
  bind:this={card}
  role="group"
  aria-label={label}
  class={cn(dragging && "opacity-50")}
  ondragover={(e) => card && onDragOver?.(e, card)}
>
  <Card.Root class={cn("py-3", !spec && "border-dashed")}>
    <Card.Header class="flex items-center gap-2 px-3">
      {#if onDragStart}
        <span
          role="button"
          tabindex="-1"
          aria-label="Drag to reorder"
          class="text-muted-foreground cursor-grab"
          draggable="true"
          ondragstart={dragStart}
          ondragend={() => onDragEnd?.()}
        ><GripVertical class="size-4" /></span>
      {/if}
      {#if spec}
        <span class="[&_svg]:size-5 [&_svg]:fill-current shrink-0" aria-hidden="true">{@html spec.icon}</span>
      {/if}
      <div class="min-w-0 flex-1">
        <Card.Title class="truncate text-sm">
          {#if spec}{label}{:else}Not found "{name}"{/if}
          {#if detail}<span class="text-muted-foreground font-normal">{detail}</span>{/if}
        </Card.Title>
      </div>
      {#if onMove}
        <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={!canMoveUp} onclick={() => onMove(-1)}><ChevronUp /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={!canMoveDown} onclick={() => onMove(1)}><ChevronDown /></Button>
      {/if}
      {#if configurable}
        <Button variant="ghost" size="icon-sm" aria-label="Configure {label}" aria-expanded={expanded} onclick={() => (expanded = !expanded)}><Settings2 /></Button>
      {/if}
      {#if onRemove}
        <Button variant="ghost" size="icon-sm" aria-label="Remove {label}" onclick={onRemove}><X /></Button>
      {/if}
    </Card.Header>
    {#if spec && configurable && expanded}
      <Card.Content class="px-3 pt-2">
        <SchemaForm schema={spec.specs} bind:values {prefix} />
      </Card.Content>
    {/if}
  </Card.Root>
</div>
