<script lang="ts">
  import bcrypt from "bcryptjs"
  import { coerce } from "$lib/config/schema"
  import type { FormElement } from "$lib/types"
  import { Input } from "$lib/components/ui/input"
  import { Textarea } from "$lib/components/ui/textarea"
  import { Switch } from "$lib/components/ui/switch"
  import { Label } from "$lib/components/ui/label"
  import * as Select from "$lib/components/ui/select"
  import { Button } from "$lib/components/ui/button"
  import Help from "./Help.svelte"

  let { el, name, value = $bindable() }: { el: FormElement; name: string; value?: unknown } = $props()

  let reveal = $state(false)
  const text = $derived(value === null || value === undefined ? "" : String(value))
  const listId = $derived(`${name}-list`)

  function onFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => (value = reader.result as string)
    reader.readAsDataURL(file)
  }

  function hash() {
    if (text !== "" && !/^\$2[abxy]\$\d\d\$/.test(text)) value = bcrypt.hashSync(text, 10)
  }
</script>

{#if el.type === "hidden"}
  <!-- value is kept, nothing rendered -->
{:else}
  <div class="space-y-2">
    {#if el.type === "boolean"}
      <div class="flex items-center gap-3">
        <Switch id={name} {name} disabled={el.readonly} checked={Boolean(value)} onCheckedChange={(c) => (value = coerce(el, c))} />
        <Label for={name}>{el.label}</Label>
      </div>
    {:else}
      <Label for={name}>{el.label}</Label>
      {#if el.type === "long_text" || el.type === "json"}
        <Textarea id={name} {name} class="field-sizing-fixed min-h-24 w-full max-w-full min-w-0 break-all whitespace-pre-wrap" placeholder={el.placeholder} disabled={el.readonly} value={text}
          oninput={(e) => (value = coerce(el, e.currentTarget.value))} />
      {:else if el.type === "password" || el.type === "long_password"}
        <div class="flex gap-2">
          <Input id={name} {name} type={reveal ? "text" : "password"} placeholder={el.placeholder} disabled={el.readonly}
            value={text} oninput={(e) => (value = coerce(el, e.currentTarget.value))} />
          <Button type="button" variant="outline" onclick={() => (reveal = !reveal)}>{reveal ? "Hide" : "Show"}</Button>
        </div>
      {:else if el.type === "bcrypt"}
        <Input id={name} {name} type="password" placeholder={el.placeholder} disabled={el.readonly} value={text}
          oninput={(e) => (value = coerce(el, e.currentTarget.value))} onblur={hash} />
      {:else if el.type === "number"}
        <Input id={name} {name} type="number" placeholder={el.placeholder} disabled={el.readonly} value={text}
          oninput={(e) => (value = coerce(el, e.currentTarget.value))} />
      {:else if el.type === "date" || el.type === "datetime"}
        <Input id={name} {name} type={el.type === "date" ? "date" : "datetime-local"} disabled={el.readonly} value={text}
          oninput={(e) => (value = coerce(el, e.currentTarget.value))} />
      {:else if el.type === "file" || el.type === "image"}
        <Input id={name} {name} type="file" accept={el.type === "image" ? "image/*" : undefined} disabled={el.readonly}
          onchange={onFile} />
      {:else if el.type === "select"}
        <Select.Root type="single" {name} disabled={el.readonly} value={text}
          onValueChange={(v) => (value = coerce(el, v))}>
          <Select.Trigger id={name} class="w-full">{text || el.placeholder || "Select…"}</Select.Trigger>
          <Select.Content>
            {#each el.options ?? [] as opt (opt)}
              <Select.Item value={opt} label={opt}>{opt}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      {:else}
        <Input id={name} {name} type="text" placeholder={el.placeholder} disabled={el.readonly} value={text}
          list={el.datalist ? listId : undefined} oninput={(e) => (value = coerce(el, e.currentTarget.value))} />
        {#if el.datalist}
          <datalist id={listId}>
            {#each el.datalist as opt (opt)}<option value={opt}></option>{/each}
          </datalist>
        {/if}
      {/if}
    {/if}
    {#if el.description}<Help description={el.description} />{/if}
  </div>
{/if}
