<script lang="ts">
  import { t, storageName, methodName } from "$lib/i18n"
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
    <Label for="{id}-name">{t("Name")}</Label>
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
    <legend class="mb-3 text-sm font-medium">{t("How do people get in?")}</legend>
    <RadioGroup.Root bind:value={entry.mode}>
      <div class="flex items-start gap-3">
        <RadioGroup.Item value="own" id="{id}-own" class="mt-0.5" />
        <Label for="{id}-own" class="font-normal">
          {t("Users enter their own {{VALUE}} login on the login page", storageName(entry.type))}
        </Label>
      </div>
      <div class="flex items-start gap-3">
        <RadioGroup.Item value="signin" id="{id}-signin" class="mt-0.5" disabled={method === null} />
        <div class="space-y-1">
          <Label for="{id}-signin" class="font-normal">
            {method === null
              ? t("Users sign in with a login method, you hold the credentials")
              : t("Users sign in with {{VALUE}}, you hold the credentials", methodName(method))}
          </Label>
          {#if method === null}
            <a class="text-sm underline" data-link href={href("admin/authentication")}>{t("Set up a login method first")}</a>
          {/if}
        </div>
      </div>
    </RadioGroup.Root>
    {#if savedSignin && entry.mode === "own"}
      <p role="status" class="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
        {t("The stored connection details will be removed when you save.")}
      </p>
    {/if}
  </fieldset>

  {#if entry.mode === "signin" && method !== null}
    <section class="space-y-4">
      <div>
        <h3 class="text-base font-medium">{t("Connection details")}</h3>
        <p class="text-muted-foreground text-sm">
          {t("Values can use the variables {{VALUE}} provides:", methodName(method))} <code>{variables}</code>
        </p>
      </div>
      {#if schema}
        <SchemaForm {schema} bind:values={entry.details} prefix="{id}-" hidden={["type"]} />
      {:else}
        <p class="text-muted-foreground text-sm">{t("No connection form is available for {{VALUE}}.", storageName(entry.type))}</p>
      {/if}
    </section>
  {/if}
</div>
