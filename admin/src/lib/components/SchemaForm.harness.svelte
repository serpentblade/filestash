<script lang="ts">
  import SchemaForm from "./SchemaForm.svelte"
  import type { Schema } from "$lib/types"

  let { schema, values: initial, prefix = "", hidden = [] }: {
    schema: Schema
    values: Record<string, any>
    prefix?: string
    hidden?: string[]
  } = $props()

  // svelte-ignore state_referenced_locally
  let values = $state(initial)
</script>

<SchemaForm {schema} bind:values {prefix} {hidden} />
<output data-testid="out">{JSON.stringify(values)}</output>
