<script lang="ts">
  import { t } from "$lib/i18n"
  import "./app.css"
  import { onMount } from "svelte"
  import { Toaster } from "$lib/components/ui/sonner"
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte"
  import { route, href, safeNext } from "$lib/router"
  import { redirect } from "$lib/redirect"
  import { session } from "$lib/session.svelte"
  import Layout from "$lib/shell/Layout.svelte"
  import LoginForm from "$lib/shell/LoginForm.svelte"
  import LoginDialog from "$lib/shell/LoginDialog.svelte"
  import AuthenticationPage from "./pages/authentication/AuthenticationPage.svelte"
  import StoragePage from "./pages/storage/StoragePage.svelte"
  import WorkflowList from "./pages/workflow/WorkflowList.svelte"
  import WorkflowEditor from "./pages/workflow/WorkflowEditor.svelte"
  import ActivityPage from "./pages/activity/ActivityPage.svelte"
  import SettingsPage from "./pages/settings/SettingsPage.svelte"
  import AboutPage from "./pages/about/AboutPage.svelte"
  import SetupPage from "./pages/setup/SetupPage.svelte"

  import { getSession } from "$lib/api/endpoints"
  import { Button } from "$lib/components/ui/button"
  import Loader2Icon from "@lucide/svelte/icons/loader-2"

  let failed = $state(false)

  // The first check is awaited here so a failure can be shown; later polls swallow errors in session.
  async function check() {
    failed = false
    try {
      const ok = await getSession()
      if (session.isAdmin === null) session.isAdmin = ok
    } catch {
      failed = session.isAdmin === null
    }
  }

  onMount(() => {
    void check()
    return session.start()
  })

  // Once the shell has been shown it stays mounted; an expired session only opens the dialog.
  let wasAdmin = $state(false)
  $effect(() => {
    if (session.isAdmin === true) wasAdmin = true
  })
  const authed = $derived(session.isAdmin === true || wasAdmin)

  $effect(() => {
    if ($route?.name === "home") {
      redirect(safeNext($route.query.get("next"), location.origin) ?? href("admin/storage"))
    }
  })
</script>

{#if $route?.name === "setup"}
  <SetupPage />
{:else if $route?.name === "home"}
  <!-- redirecting -->
{:else if authed}
  <Layout>
    {#if $route?.name === "authentication"}
      <AuthenticationPage />
    {:else if $route?.name === "storage"}
      <StoragePage />
    {:else if $route?.name === "workflow-list"}
      <WorkflowList />
    {:else if $route?.name === "workflow-edit" || $route?.name === "workflow-new"}
      {#key `${$route.name}:${$route.params.id ?? ""}`}
        <WorkflowEditor />
      {/key}
    {:else if $route?.name === "activity"}
      <ActivityPage />
    {:else if $route?.name === "settings"}
      <SettingsPage />
    {:else if $route?.name === "about"}
      <AboutPage />
    {:else}
      <h1 class="text-2xl font-semibold">{t("Page not found")}</h1>
      <a class="mt-2 inline-block underline" data-link href={href("admin/storage")}>{t("Back to Storage")}</a>
    {/if}
  </Layout>
  <LoginDialog />
{:else if session.isAdmin === null}
  <div class="flex min-h-screen items-center justify-center p-6">
    {#if failed}
      <div class="flex flex-col items-center gap-3">
        <p>{t("Can't reach the server")}</p>
        <Button onclick={check}>{t("Retry")}</Button>
      </div>
    {:else}
      <div role="status" aria-label={t("Loading")}><Loader2Icon class="size-6 animate-spin" /></div>
    {/if}
  </div>
{:else if session.isAdmin === false}
  <div class="flex min-h-screen items-center justify-center p-6">
    <div class="w-full max-w-sm">
      <h1 class="mb-4 text-2xl font-semibold">{t("Admin console")}</h1>
      <LoginForm />
    </div>
  </div>
{/if}

<ConfirmDialog />
<Toaster />
