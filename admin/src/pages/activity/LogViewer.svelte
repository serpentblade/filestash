<script lang="ts">
  import { onMount, tick } from "svelte"
  import { getLogs, logsUrl } from "$lib/api/endpoints"
  import { poll } from "$lib/hooks/poll"
  import { Button } from "$lib/components/ui/button"

  let text = $state("…")
  let pre: HTMLPreElement | undefined = $state()
  let hovered = false

  const filename = `access_${new Date().toISOString().substring(0, 10).replace(/-/g, "")}.log`

  onMount(() =>
    poll(
      async () => {
        const log = await getLogs(102400)
        // stay put when the user has scrolled up to read
        const atBottom = !pre || pre.scrollHeight - pre.scrollTop - pre.clientHeight < 24
        text = log
        if (atBottom) {
          await tick()
          if (pre) pre.scrollTop = pre.scrollHeight
        }
      },
      2500,
      () => hovered,
    ),
  )
</script>

<div class="space-y-3">
  <pre
    bind:this={pre}
    onmouseenter={() => (hovered = true)}
    onmouseleave={() => (hovered = false)}
    class="bg-muted h-[350px] overflow-auto rounded-md p-3 text-xs">{text}</pre>
  <Button variant="outline" href={logsUrl()} download={filename}>Download</Button>
</div>
