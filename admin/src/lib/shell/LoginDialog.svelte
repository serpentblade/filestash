<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog"
  import { session } from "$lib/session.svelte"
  import LoginForm from "./LoginForm.svelte"
</script>

<Dialog.Root bind:open={session.loginOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Session expired</Dialog.Title>
      <Dialog.Description>Log in again to continue. Your unsaved changes are kept.</Dialog.Description>
    </Dialog.Header>
    <LoginForm />
  </Dialog.Content>
</Dialog.Root>
