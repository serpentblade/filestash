export type ConfirmOptions = { title: string; body: string; confirmLabel: string; destructive?: boolean }

class ConfirmState {
  current = $state<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)
}

export const confirmState = new ConfirmState()

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  // a second request while one is open answers the first with "no"
  confirmState.current?.resolve(false)
  return new Promise((resolve) => {
    confirmState.current = { ...opts, resolve }
  })
}

export function settle(ok: boolean): void {
  const cur = confirmState.current
  confirmState.current = null
  cur?.resolve(ok)
}
