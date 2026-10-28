<script lang="ts">
  // The html is a hard-coded preset constant (it contains links), never user input.
  let { html }: { html: string } = $props()
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -->
<div class="[&_a]:underline [&_a]:underline-offset-2">{@html html}</div>
