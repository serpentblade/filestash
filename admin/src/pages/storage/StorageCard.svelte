<script lang="ts">
  import { t, storageName, methodName } from "$lib/i18n"
  import type { StorageEntry } from "$lib/config/storage"
  import { Badge } from "$lib/components/ui/badge"
  import { cn } from "$lib/utils"

  let { entry, method, selected, duplicate, onselect }: {
    entry: StorageEntry
    method: string | null
    selected: boolean
    duplicate: boolean
    onselect: () => void
  } = $props()

  const mode = $derived(entry.mode === "signin" && method !== null ? t("Sign in with {{VALUE}}", methodName(method)) : t("Users enter their own login"))
</script>

<button
  type="button"
  aria-pressed={selected}
  onclick={onselect}
  class={cn(
    "hover:bg-muted w-full rounded-lg border px-3 py-2 text-left transition-colors",
    selected && "border-primary bg-muted",
  )}
>
  <span class="flex items-center gap-2">
    <span class="min-w-0 truncate font-medium">{entry.label.trim() || t("Untitled")}</span>
    <Badge variant="secondary">{storageName(entry.type)}</Badge>
    {#if duplicate}<Badge variant="destructive">{t("Duplicate name")}</Badge>{/if}
  </span>
  <span class="text-muted-foreground block text-sm">{mode}</span>
</button>
