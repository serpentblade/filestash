<script lang="ts">
  import LogViewer from "./LogViewer.svelte"
  import LogChart from "./LogChart.svelte"
  import LogSettings from "./LogSettings.svelte"
  import Audit from "./Audit.svelte"
  import { t } from "$lib/i18n"
</script>

<div class="space-y-8">
  <h1 class="text-2xl font-semibold">{t("Activity")}</h1>
  <section class="space-y-4">
    <h2 class="text-xl font-semibold">{t("System Logs")}</h2>
    <LogViewer />
    <LogChart />
    <LogSettings />
  </section>
  <section class="space-y-4">
    <h2 class="text-xl font-semibold">{t("Audit Report")}</h2>
    <Audit />
  </section>
</div>
