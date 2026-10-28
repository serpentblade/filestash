<script lang="ts">
  import { onMount } from "svelte"
  import { getLogs } from "$lib/api/endpoints"
  import { handlePollError, poll } from "$lib/hooks/poll"
  import { t } from "$lib/i18n"
  import { bucketLogTimes, type Buckets } from "./chart"

  let data = $state<Buckets | null>(null)
  let failed = $state(false)

  onMount(() =>
    poll(async () => {
      data = bucketLogTimes(await getLogs(307200))
      failed = false
    }, 2500, undefined, (err) => handlePollError(err, (f) => (failed = f))),
  )

  const time = (t: number) => new Date(t).toLocaleTimeString()
</script>

{#if failed}
  <p class="text-destructive text-sm">{t("Couldn't load logs")}</p>
{/if}
{#if data && data.counts.every((c) => c < 0)}
  <p class="text-muted-foreground text-sm">{t("No log events yet")}</p>
{:else if data}
  <div class="flex h-24 items-end justify-end" aria-label={t("Log events over time")}>
    {#each data.counts as count, i (i)}
      {#if count >= 0}
        <div
          class="bg-muted border-border min-w-0 max-w-11 flex-1 rounded-t-sm border-2"
          title={String(count)}
          style:height="{Math.min((Math.sqrt(count) / Math.sqrt(data.max)) * 100, 120)}%"
        ></div>
      {/if}
    {/each}
  </div>
  <div class="text-muted-foreground flex justify-between text-xs">
    <span>{time(data.start)}</span>
    <span class="italic">{t("Log Events")}</span>
    <span>{time(data.end)}</span>
  </div>
{/if}
