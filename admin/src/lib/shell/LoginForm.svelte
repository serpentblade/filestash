<script lang="ts">
  import { t } from "$lib/i18n"
  import { Button } from "$lib/components/ui/button"
  import { Input } from "$lib/components/ui/input"
  import { Label } from "$lib/components/ui/label"
  import Loader2Icon from "@lucide/svelte/icons/loader-2"
  import { ApiError } from "$lib/api/http"
  import { session } from "$lib/session.svelte"

  let password = $state("")
  let error = $state("")
  let busy = $state(false)

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    if (busy) return
    busy = true
    error = ""
    try {
      await session.login(password)
      password = ""
    } catch (err) {
      const transport = err instanceof ApiError && (err.code === "NETWORK" || err.code === "SERVER")
      error = transport ? (err as ApiError).message : t("Incorrect password")
    } finally {
      busy = false
    }
  }
</script>

<form class="flex flex-col gap-3" onsubmit={submit}>
  <Label for="admin-password">{t("Password")}</Label>
  <Input
    id="admin-password"
    type="password"
    autocomplete="current-password"
    bind:value={password}
    aria-invalid={error ? true : undefined}
    disabled={busy}
  />
  {#if error}
    <p class="text-sm text-destructive" role="alert">{error}</p>
  {/if}
  <Button type="submit" disabled={busy || password === ""}>
    {#if busy}<Loader2Icon class="size-4 animate-spin" />{/if}
    {t("Log in")}
  </Button>
</form>
