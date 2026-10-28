import { getAdminConfig, getPublicConfig, postConfig } from "$lib/api/endpoints"
import { ApiError } from "$lib/api/http"
import { session } from "$lib/session.svelte"
import type { Connection } from "$lib/types"
import { toValues } from "./schema"

type Current = { values: Record<string, unknown>; connections: Connection[] }

/**
 * The server replaces the whole config on POST, so every save starts from fresh
 * server state and the patch changes only what the caller owns.
 *
 * Callers should pass `$state.snapshot(...)` of reactive state into anything that
 * clones (structuredClone throws on Svelte `$state` proxies). The patch's return
 * value is not cloned; JSON serialization in the POST handles proxies fine.
 */
export async function saveConfig(patch: (current: Current) => Current): Promise<void> {
  try {
    const [admin, pub] = await Promise.all([getAdminConfig(), getPublicConfig()])
    const values = toValues(admin)
    delete values.constant
    const connections = structuredClone(pub.connections)
    const next = patch({ values, connections })
    await postConfig({ ...next.values, connections: next.connections })
  } catch (err) {
    if (err instanceof ApiError && err.code === "FORBIDDEN") session.requireLogin()
    throw err
  }
}
