<script lang="ts">
  import SchemaForm from "./SchemaForm.svelte"
  import { createDraft } from "$lib/draft.svelte"
  import type { Schema } from "$lib/types"

  let { schema }: { schema: Schema } = $props()

  const d = createDraft<Record<string, any>>({})
</script>

<SchemaForm {schema} bind:values={d.value} />
<output data-testid="dirty">{d.dirty}</output>
