<script lang="ts">
  import * as AlertDialog from "$lib/components/ui/alert-dialog"
  import { confirmState, settle } from "$lib/confirm.svelte"

  const cur = $derived(confirmState.current)
</script>

<AlertDialog.Root open={cur !== null} onOpenChange={(o) => { if (!o) settle(false) }}>
  <!-- above every other dialog: a confirm can open over the create-storage dialog -->
  <AlertDialog.Content class="z-[61]" overlayClass="z-[60]">
    <AlertDialog.Header>
      <AlertDialog.Title>{cur?.title}</AlertDialog.Title>
      <AlertDialog.Description>{cur?.body}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action variant={cur?.destructive ? "destructive" : "default"} onclick={() => settle(true)}>
        {cur?.confirmLabel}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
