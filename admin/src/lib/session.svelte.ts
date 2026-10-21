import { getSession, login } from "$lib/api/endpoints"

const POLL_MS = 30000

class Session {
  isAdmin = $state<boolean | null>(null)
  loginOpen = $state(false)

  requireLogin(): void {
    this.loginOpen = true
  }

  async login(password: string): Promise<void> {
    await login(password)
    this.isAdmin = true
    this.loginOpen = false
  }

  async refresh(): Promise<void> {
    let next: boolean
    try {
      next = await getSession()
    } catch {
      return
    }
    const wasAdmin = this.isAdmin === true
    this.isAdmin = next
    if (wasAdmin && !next) this.loginOpen = true
  }

  start(): () => void {
    void this.refresh()
    const timer = setInterval(() => void this.refresh(), POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") void this.refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }
}

export const session = new Session()
