<script lang="ts">
  import { t } from "$lib/i18n"
  import { onMount } from "svelte"
  import { route, href } from "$lib/router"
  import { getRelease } from "$lib/api/endpoints"

  const items = [
    { label: () => t("Authentication"), path: "admin/authentication", names: ["authentication"] },
    { label: () => t("Storage"), path: "admin/storage", names: ["storage"] },
    { label: () => t("Workflow"), path: "admin/workflow", names: ["workflow-list", "workflow-edit", "workflow-new"] },
    { label: () => t("Activity"), path: "admin/activity", names: ["activity"] },
    { label: () => t("Settings"), path: "admin/settings", names: ["settings"] },
  ]

  let version = $state("")
  onMount(() => {
    getRelease().then((r) => (version = r.version)).catch(() => {})
  })

  const link = "block rounded-md px-3 py-2 text-sm hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium"
</script>

<nav class="flex h-full w-56 shrink-0 flex-col gap-1 border-r p-3">
  <div class="px-3 py-2 text-lg font-semibold">Filestash</div>
  {#each items as item (item.path)}
    <a
      class={link}
      data-link
      href={href(item.path)}
      aria-current={$route && item.names.includes($route.name) ? "page" : undefined}
    >{item.label()}</a>
  {/each}
  <a
    class="{link} mt-auto text-muted-foreground"
    data-link
    href={href("admin/about")}
    aria-current={$route?.name === "about" ? "page" : undefined}
  >{version || t("About")}</a>
</nav>
