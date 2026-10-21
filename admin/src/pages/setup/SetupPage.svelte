<script lang="ts">
  import bcrypt from "bcryptjs"
  import { toast } from "svelte-sonner"
  import Loader2Icon from "@lucide/svelte/icons/loader-2"
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left"
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right"
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check"
  import CircleAlertIcon from "@lucide/svelte/icons/circle-alert"
  import { getAdminConfig, getAuthMiddlewares, getBackends, getPublicConfig } from "$lib/api/endpoints"
  import { saveConfig } from "$lib/config/save"
  import { toValues } from "$lib/config/schema"
  import { confirm } from "$lib/confirm.svelte"
  import { redirect } from "$lib/redirect"
  import { href, navigate, route } from "$lib/router"
  import { session } from "$lib/session.svelte"
  import type { Connection, Schema } from "$lib/types"
  import { Button } from "$lib/components/ui/button"
  import { Checkbox } from "$lib/components/ui/checkbox"
  import * as Dialog from "$lib/components/ui/dialog"
  import { Input } from "$lib/components/ui/input"
  import { Label } from "$lib/components/ui/label"
  import { cn } from "$lib/utils"
  import ToastHtml from "./ToastHtml.svelte"
  import { fieldLabel, t } from "$lib/i18n"
  import { PRESETS, applyPresetInputs, healthChecks, presetAvailable, presetFields, presetName, presetSuccess, type Preset } from "./presets"

  let step = $state<1 | 2 | null>(null)
  let loadError = $state("")
  let pwd = ""

  // step 1
  let password = $state("")
  let pwdError = $state("")
  let pwdBusy = $state(false)
  // once the hash is written, a retry must only log in: the config is no longer open to anonymous writes
  let hashSaved = $state(false)

  // step 2
  let constant = $state({ user: "", license: "" })
  let connections = $state<Connection[]>([])
  let backends = $state<Record<string, Schema>>({})
  let auths = $state<Record<string, Schema>>({})
  let depsReady = $state(false)

  let started = false
  async function init() {
    started = true
    loadError = ""
    try {
      const values = toValues(await getAdminConfig()) as { auth?: { admin?: unknown }; constant?: { user?: string; license?: string } }
      const asked = parseInt($route?.query.get("step") ?? "", 10)
      step = asked === 1 || asked === 2 ? asked : values.auth?.admin ? 2 : 1
    } catch (err) {
      started = false
      loadError = err instanceof Error ? err.message : t("Can't reach the server")
    }
  }

  $effect(() => {
    if (session.isAdmin === true && step === null && !started) void init()
  })

  // Setting the password makes the session briefly report "not admin" until the login lands.
  $effect(() => {
    if (session.isAdmin === false && !pwdBusy && !hashSaved) redirect(href("admin/"))
  })

  async function loadDeps() {
    try {
      const [admin, b, a, pub] = await Promise.all([getAdminConfig(), getBackends(), getAuthMiddlewares(), getPublicConfig()])
      const values = toValues(admin) as { constant?: { user?: string; license?: string } }
      constant = { user: values.constant?.user ?? "", license: values.constant?.license ?? "" }
      backends = b
      auths = a
      connections = pub.connections
      depsReady = true
    } catch (err) {
      loadError = err instanceof Error ? err.message : t("Can't reach the server")
    }
  }

  $effect(() => {
    if (step === 2 && !depsReady) void loadDeps()
  })

  async function setPassword(e: SubmitEvent) {
    e.preventDefault()
    if (pwdBusy || password === "") return
    pwdBusy = true
    pwdError = ""
    try {
      if (!hashSaved) {
        const hash = bcrypt.hashSync(password)
        await saveConfig(({ values, connections }) => {
          ;(values.auth as Record<string, unknown>).admin = hash
          return { values, connections }
        })
        hashSaved = true
      }
      try {
        await session.login(password)
      } catch {
        pwdError = t("Password set. Log in to continue.")
        return
      }
      pwd = password
      password = ""
      step = 2
    } catch (err) {
      pwdError = err instanceof Error ? err.message : t("Could not set the password")
    } finally {
      pwdBusy = false
    }
  }

  const checks = $derived(
    healthChecks({ protocol: location.protocol, user: constant.user, license: constant.license, connections: connections.length }),
  )

  // --- presets
  let missingOpen = $state(false)
  let inputPreset = $state<Preset | null>(null)
  let inputFields = $state<string[]>([])
  let inputValues = $state<Record<string, string>>({})
  let resolveInputs: ((v: Record<string, string> | null) => void) | null = null
  const inputsFilled = $derived(Object.values(inputValues).some((v) => v !== ""))

  function askInputs(p: Preset, fields: string[]): Promise<Record<string, string> | null> {
    inputValues = Object.fromEntries(fields.map((f) => [f, ""]))
    inputFields = fields
    inputPreset = p
    return new Promise((resolve) => (resolveInputs = resolve))
  }

  function settleInputs(v: Record<string, string> | null) {
    inputPreset = null
    resolveInputs?.(v)
    resolveInputs = null
  }

  let applying = $state(false)
  async function applyPreset(p: Preset) {
    if (applying) return
    if (!presetAvailable(p, backends, auths)) {
      missingOpen = true
      return
    }
    applying = true
    try {
      await run(p)
    } finally {
      applying = false
    }
  }

  async function run(p: Preset) {
    if (connections.length > 0) {
      const ok = await confirm({
        title: t("Replace your existing storages?"),
        body: t("This preset replaces your current storages ({{VALUE}}) and the login method.", connections.map((c) => c.label).join(", ")),
        confirmLabel: t("Replace"),
        destructive: true,
      })
      if (!ok) return
    }
    const fields = presetFields(p).filter((f) => !(f === "admin_password" && pwd !== ""))
    let inputs: Record<string, string> = {}
    if (fields.length > 0) {
      const answered = await askInputs(p, fields)
      if (answered === null) return
      inputs = answered
    }
    const out = applyPresetInputs(p, inputs, pwd === "" ? undefined : pwd)
    try {
      await saveConfig(({ values }) => {
        const middleware = values.middleware as Record<string, unknown>
        middleware.attribute_mapping = out.attribute_mapping
        middleware.identity_provider = out.identity_provider
        return { values, connections: out.connections }
      })
      connections = out.connections
      toast.success(ToastHtml, { componentProps: { html: presetSuccess(p) } })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Could not apply the preset"))
    }
  }

  // --- telemetry, asked when leaving step 2
  let telemetryOpen = $state(false)
  let telemetryChecked = $state(false)
  let resolveTelemetry: ((v: boolean) => void) | null = null

  function settleTelemetry(v: boolean) {
    telemetryOpen = false
    resolveTelemetry?.(v)
    resolveTelemetry = null
  }

  let leaving = false
  async function leave(action: () => void) {
    if (leaving) return
    leaving = true
    try {
      await ask()
    } finally {
      leaving = false
    }
    action()
  }

  async function ask() {
    let enabled = false
    try {
      const values = toValues(await getAdminConfig()) as { log?: { telemetry?: unknown } }
      if (values.log?.telemetry !== true) {
        telemetryChecked = false
        telemetryOpen = true
        enabled = await new Promise<boolean>((resolve) => (resolveTelemetry = resolve))
        if (enabled) {
          await saveConfig(({ values, connections }) => {
            ;(values.log as Record<string, unknown>).telemetry = true
            return { values, connections }
          })
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Could not save the telemetry choice"))
    }
  }
  // one sentence around the link, so a translation can move the link
  const [moreBefore, moreAfter = ""] = t(
    "Want more? Head to {{LINK}} to wire up your own storage, authentication via SSO, and RBAC authorization.",
  ).split("{{LINK}}")
</script>

<div class="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 p-6">
  {#if loadError}
    <div class="flex flex-col items-start gap-3" role="alert">
      <p>{loadError}</p>
      <Button onclick={() => { loadError = ""; if (step === null) void init(); else void loadDeps() }}>{t("Retry")}</Button>
    </div>
  {:else if step === null}
    <div role="status" aria-label={t("Loading")} class="flex justify-center"><Loader2Icon class="size-6 animate-spin" /></div>
  {:else if step === 1}
    <h1 class="text-2xl font-semibold">{t("Welcome Aboard!")}</h1>
    <form class="flex flex-col gap-3" onsubmit={setPassword}>
      <Label for="setup-password">{t("First thing first, setup your password:")}</Label>
      <div class="flex gap-2">
        <Input
          id="setup-password"
          type="password"
          placeholder={t("Password")}
          autocomplete="new-password"
          bind:value={password}
          disabled={pwdBusy || hashSaved}
          aria-invalid={pwdError ? true : undefined}
        />
        <Button type="submit" size="icon" aria-label={hashSaved ? t("Log in") : t("Continue")} disabled={pwdBusy || password === ""}>
          {#if pwdBusy}<Loader2Icon class="size-4 animate-spin" />{:else}<ArrowRightIcon class="size-4" />{/if}
        </Button>
      </div>
      {#if pwdError}<p class="text-destructive text-sm" role="alert">{pwdError}</p>{/if}
    </form>
  {:else}
    <h1 class="flex items-center gap-2 text-2xl font-semibold">
      <Button variant="ghost" size="icon" aria-label={t("Previous step")} onclick={() => leave(() => (step = 1))}>
        <ArrowLeftIcon class="size-4" />
      </Button>
      {t("You're at the Helm now")}
    </h1>
    {#if !depsReady}
      <div role="status" aria-label={t("Loading")} class="flex justify-center"><Loader2Icon class="size-6 animate-spin" /></div>
    {:else}
      <ul class="space-y-3">
        {#each checks as check (check.key)}
          <li class={cn("rounded-md border p-3", !check.pass && check.severe && "border-destructive/50")}>
            <div class="flex items-center gap-2 font-medium">
              {#if check.pass}
                <CircleCheckIcon class="size-4 text-green-600" />
              {:else}
                <CircleAlertIcon class={cn("size-4", check.severe ? "text-destructive" : "text-muted-foreground")} />
              {/if}
              <strong>{check.pass ? check.nameSuccess : check.nameFailure}</strong>
            </div>
            {#if check.key === "storage"}
              <div id="configuration-preset" class="mt-2 space-y-2 text-sm">
                <p class="italic">{check.message}</p>
                {#each PRESETS as preset (preset.name)}
                  <div class="flex items-center gap-2">
                    <Button variant="outline" size="sm" class="uppercase" disabled={applying} onclick={() => applyPreset(preset)}>
                      {t("Apply preset")}
                    </Button>
                    <span>&#x27A1; {presetName(preset)}</span>
                  </div>
                {/each}
                <p class="mt-2 rounded-md border border-dashed p-2 italic">
                  {t("Notes: Templates get you started quickly, but they're just scratching the surface.")}
                  {moreBefore}
                  <a
                    class="underline"
                    href={href("admin/storage")}
                    onclick={(e) => { e.preventDefault(); void leave(() => void navigate("admin/storage")) }}
                  >/admin/storage</a>
                  {moreAfter}
                </p>
              </div>
            {:else if !check.pass}
              <p class="text-muted-foreground mt-1 text-sm italic">{check.message}</p>
            {/if}
          </li>
        {/each}
      </ul>
      <div>
        <Button onclick={() => leave(() => void navigate("admin/storage"))}>{t("Continue to admin")}</Button>
      </div>
    {/if}
  {/if}
</div>

<Dialog.Root open={missingOpen} onOpenChange={(o) => (missingOpen = o)}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{t("Preset unavailable")}</Dialog.Title>
      <Dialog.Description>{t("Your build is missing some plugins. Contact Support")}</Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer><Button onclick={() => (missingOpen = false)}>{t("OK")}</Button></Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root open={inputPreset !== null} onOpenChange={(o) => { if (!o) settleInputs(null) }}>
  <Dialog.Content>
    <form
      class="space-y-4"
      onsubmit={(e) => { e.preventDefault(); if (inputsFilled) settleInputs($state.snapshot(inputValues)) }}
    >
      <Dialog.Header>
        <Dialog.Title>{inputPreset ? presetName(inputPreset) : ""}</Dialog.Title>
        <Dialog.Description>{t("Fill in the values this preset needs.")}</Dialog.Description>
      </Dialog.Header>
      {#each inputFields as field (field)}
        <div class="space-y-1">
          <Label for={`preset-${field}`}>{fieldLabel(field)}</Label>
          <Input id={`preset-${field}`} type="text" bind:value={inputValues[field]} />
        </div>
      {/each}
      <Dialog.Footer>
        <Button type="button" variant="outline" onclick={() => settleInputs(null)}>{t("Cancel")}</Button>
        <Button type="submit" disabled={!inputsFilled}>{t("Apply")}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root open={telemetryOpen} onOpenChange={(o) => { if (!o) settleTelemetry(false) }}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{t("Telemetry")}</Dialog.Title>
      <Dialog.Description>
        {t("Help making this software better by sending crash reports and anonymous usage statistics")}
      </Dialog.Description>
    </Dialog.Header>
    <div class="flex items-center gap-2 text-sm">
      <Checkbox
        id="telemetry-ok"
        bind:checked={telemetryChecked}
        onCheckedChange={(v) => { if (v) settleTelemetry(true) }}
      />
      <Label for="telemetry-ok">{t("The data is never shared with a third party.")}</Label>
    </div>
    <Dialog.Footer>
      <Button onclick={() => settleTelemetry(telemetryChecked)}>{t("OK")}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
