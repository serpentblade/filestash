<script lang="ts">
  import LogViewer from "./LogViewer.svelte"
  import LogChart from "./LogChart.svelte"
  import LogSettings from "./LogSettings.svelte"
  import Audit from "./Audit.svelte"
</script>

<div class="space-y-8">
  <h1 class="text-2xl font-semibold">Activity</h1>
  <section class="space-y-4">
    <h2 class="text-xl font-semibold">System Logs</h2>
    <LogViewer />
    <LogChart />
    <LogSettings />
  </section>
  <section class="space-y-4">
    <h2 class="text-xl font-semibold">Audit Report</h2>
    <Audit />
  </section>
</div>
