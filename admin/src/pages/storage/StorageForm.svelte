<script lang="ts">
  import type { StorageEntry } from "$lib/config/storage"
  import { validateLabel } from "$lib/config/storage"
  import type { Schema } from "$lib/types"
  import SchemaForm from "$lib/components/SchemaForm.svelte"
  import { Input } from "$lib/components/ui/input"
  import { Label } from "$lib/components/ui/label"
  import { href } from "$lib/router"
  import * as RadioGroup from "$lib/components/ui/radio-group"

  let {
    entry = $bindable(),
    backends,
    method,
    otherLabels,
    variables: tokens = ["{{ .user }}", "{{ .password }}"],
    savedSignin = false,
  }: {
    entry: StorageEntry
    backends: Record<string, Schema>
    method: string | null
    otherLabels: string[]
    // {{ .name }} tokens the login method provides to the connection details
    variables?: string[]
    // the entry is saved in sign-in mode, so switching it to own drops stored details on save
    savedSignin?: boolean
  } = $props()

  const id = $derived(entry.key)
  const labelError = $derived(validateLabel(entry.label, otherLabels))
  const schema = $derived(backends[entry.type])
  const variables = $derived(tokens.join(" "))
</script>

<div class="space-y-6">
  <div class="space-y-2">
    <Label for="{id}-name">Name</Label>
    <Input
      id="{id}-name"
      value={entry.label}
      aria-invalid={labelError !== null}
      aria-describedby={labelError ? `${id}-name-error` : undefined}
      oninput={(e) => (entry.label = e.currentTarget.value)}
      onchange={() => (entry.label = entry.label.trim())}
    />
    {#if labelError}
      <p id="{id}-name-error" class="text-destructive text-sm">{labelError}</p>
    {/if}
  </div>

  <fieldset class="space-y-3">
    <legend class="mb-3 text-sm font-medium">How do people get in?</legend>
    <RadioGroup.Root bind:value={entry.mode}>
      <div class="flex items-start gap-3">
        <RadioGroup.Item value="own" id="{id}-own" class="mt-0.5" />
        <Label for="{id}-own" class="font-normal">
          Users enter their own {entry.type.toUpperCase()} login on the login page
        </Label>
      </div>
      <div class="flex items-start gap-3">
        <RadioGroup.Item value="signin" id="{id}-signin" class="mt-0.5" disabled={method === null} />
        <div class="space-y-1">
          <Label for="{id}-signin" class="font-normal">
            Users sign in with {method ?? "a login method"}, you hold the credentials
          </Label>
          {#if method === null}
            <a class="text-sm underline" data-link href={href("admin/authentication")}>Set up a login method first</a>
          {/if}
        </div>
      </div>
    </RadioGroup.Root>
    {#if savedSignin && entry.mode === "own"}
      <p role="status" class="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
        The stored connection details will be removed when you save.
      </p>
    {/if}
  </fieldset>

  {#if entry.mode === "signin" && method !== null}
    <section class="space-y-4">
      <div>
        <h3 class="text-base font-medium">Connection details</h3>
        <p class="text-muted-foreground text-sm">
          Values can use the variables {method} provides: <code>{variables}</code>
        </p>
      </div>
      {#if schema}
        <SchemaForm {schema} bind:values={entry.details} prefix="{id}-" hidden={["type"]} />
      {:else}
        <p class="text-muted-foreground text-sm">No connection form is available for {entry.type}.</p>
      {/if}
    </section>
  {/if}
</div>
