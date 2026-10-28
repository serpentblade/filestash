<script lang="ts">
  import type { Snippet } from "svelte"
  import Sidebar from "./Sidebar.svelte"

  let { children }: { children: Snippet } = $props()
</script>

<div class="flex h-screen">
  <Sidebar />
  <main class="min-w-0 flex-1 overflow-auto p-6">{@render children()}</main>
</div>
