<script lang="ts">
  import { t, sectionLabel } from "$lib/i18n"
  import { onDestroy, onMount } from "svelte"
  import { toast } from "svelte-sonner"
  import { getAdminConfig } from "$lib/api/endpoints"
  import { saveConfig } from "$lib/config/save"
  import { omit, pick, toValues, type Schema } from "$lib/config/schema"
  import { createDraft, equal } from "$lib/draft.svelte"
  import { href, navigate, route } from "$lib/router"
  import { at, enabled, settingsSections, type Section } from "./sections"
  import SaveBar from "$lib/components/SaveBar.svelte"
  import SchemaForm from "$lib/components/SchemaForm.svelte"
  import { Skeleton } from "$lib/components/ui/skeleton"

  // shown elsewhere (log on Activity, middleware and connections on Storage) or setup-only (constant)
  const NOT_HERE = ["constant", "middleware", "log", "connections"]

  let schema = $state<Schema | null>(null)
  let failed = $state(false)
  let saving = $state(false)
  // moving between sections keeps the page, and any unsaved edits, on screen
  const draft = createDraft<Record<string, any>>({}, { stays: (to) => to?.name === "settings" })
  onDestroy(draft.dispose)

  const sections = $derived(schema ? settingsSections(schema) : [])
  const wanted = $derived($route?.name === "settings" ? ($route.params.section ?? null) : null)
  const current = $derived<Section | undefined>(
    wanted === null ? sections[0] : sections.find((s) => s.slug === wanted),
  )
  // an unknown section in the address falls back to the first one
  $effect(() => {
    if (schema && wanted !== null && !current) void navigate("admin/settings", { replace: true })
  })

  // "auth" only holds the admin password now that sign-in has its own page
  const title = (s: Section) => (s.path.join(".") === "auth" ? t("Admin password") : sectionLabel(s.path[s.path.length - 1]))
  const sectionDirty = (s: Section) => !equal($state.snapshot(at(draft.value, s.path)), at(draft.baseline, s.path))
  const status = (s: Section) => enabled(at(schema, s.path), at(draft.value, s.path))
  const groups = $derived.by(() => {
    const out: { group: string | null; items: Section[] }[] = []
    for (const s of sections) {
      const last = out[out.length - 1]
      if (last && last.group === s.group) last.items.push(s)
      else out.push({ group: s.group, items: [s] })
    }
    return out
  })
  const link = (s: Section) => href(s === sections[0] ? "admin/settings" : `admin/settings/${encodeURIComponent(s.slug)}`)

  const ownedKeys = $derived(Object.keys(schema ?? {}).filter((k) => !NOT_HERE.includes(k)))

  async function load() {
    try {
      const admin = await getAdminConfig()
      const shown = omit(admin as Record<string, unknown>, NOT_HERE) as Schema
      schema = shown
      const initial = toValues(shown)
      loadedHash = (initial.auth as Record<string, unknown> | undefined)?.admin
      draft.reset(initial)
    } catch {
      failed = true
    }
  }
  onMount(load)

  // never overwrite the admin password hash unless the user edited that field
  let loadedHash: unknown
  const adminHash = (v: Record<string, any>) => v.auth?.admin
  const untouched = (h: unknown) => h === loadedHash || h === null || h === undefined || h === ""

  async function save() {
    saving = true
    await draft.save(async (v) => {
      try {
        await saveConfig(({ values, connections }) => {
          const owned = pick(v, ownedKeys)
          if (owned.auth && untouched(adminHash(v))) {
            const fresh = (values.auth as Record<string, unknown> | undefined)?.admin
            owned.auth = { ...(owned.auth as object), admin: fresh }
          }
          return { values: { ...values, ...owned }, connections }
        })
      } catch (err) {
        toast.error(t("Couldn't save: {{VALUE}}", err instanceof Error ? err.message : String(err)))
        throw err
      }
      toast.success(t("Saved"))
      loadedHash = adminHash(v)
    })
    saving = false
  }
</script>

<h1 class="mb-6 text-2xl font-semibold">{t("Settings")}</h1>
{#if failed}
  <p class="text-destructive text-sm">{t("Couldn't load the settings.")}</p>
{:else if schema}
  <div class="flex flex-col gap-6 md:flex-row md:items-start">
    <label class="md:hidden">
      <span class="sr-only">{t("Section")}</span>
      <select
        class="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
        value={current?.slug}
        onchange={(e) => {
          const s = sections.find((x) => x.slug === e.currentTarget.value)
          if (s) void navigate(link(s))
        }}
      >
        {#each groups as g (g.group ?? "")}
          {#if g.group === null}
            {#each g.items as s (s.slug)}
              <option value={s.slug}>{title(s)}{sectionDirty(s) ? " •" : ""}</option>
            {/each}
          {:else}
            <optgroup label={sectionLabel(g.group)}>
              {#each g.items as s (s.slug)}
                <option value={s.slug}>{title(s)}{sectionDirty(s) ? " •" : ""}</option>
              {/each}
            </optgroup>
          {/if}
        {/each}
      </select>
    </label>

    <nav class="hidden w-52 shrink-0 md:block" aria-label={t("Settings sections")}>
      {#each groups as g (g.group ?? "")}
        {#if g.group !== null}
          <div class="text-muted-foreground mt-4 mb-1 px-3 text-xs font-medium tracking-wide uppercase">{sectionLabel(g.group)}</div>
        {/if}
        <ul class="space-y-0.5">
          {#each g.items as s (s.slug)}
            {@const on = status(s)}
            <li>
              <a
                data-link
                href={link(s)}
                aria-current={s === current ? "page" : undefined}
                class="hover:bg-muted flex items-center gap-2 rounded-md px-3 py-1.5 text-sm aria-[current=page]:bg-muted aria-[current=page]:font-medium"
              >
                <span class="min-w-0 flex-1 truncate">{title(s)}</span>
                {#if sectionDirty(s)}
                  <span class="bg-primary size-1.5 rounded-full" aria-hidden="true"></span>
                  <span class="sr-only">{t("Unsaved changes")}</span>
                {/if}
                {#if on !== null}
                  <span class="text-muted-foreground text-xs">{on ? t("On") : t("Off")}</span>
                {/if}
              </a>
            </li>
          {/each}
        </ul>
      {/each}
    </nav>

    <div class="min-w-0 flex-1">
      {#if current}
        <h2 class="mb-4 text-lg font-medium">{title(current)}</h2>
        {#key current.slug}
          {#if current.path.length === 1}
            {@const [a] = current.path}
            <SchemaForm schema={schema[a] as Schema} bind:values={draft.value[a]} prefix={a + "."} />
          {:else}
            {@const [a, b] = current.path}
            <SchemaForm schema={(schema[a] as Schema)[b] as Schema} bind:values={draft.value[a][b]} prefix={a + "." + b + "."} />
          {/if}
        {/key}
      {/if}
    </div>
  </div>
  <SaveBar dirty={draft.dirty} {saving} onSave={save} onDiscard={() => draft.reset()} />
{:else}
  <Skeleton class="h-40 w-full" />
{/if}
