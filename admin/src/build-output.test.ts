/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Vitest runs from admin/, so the bundle sits one level up in public/.
const bundle = resolve(process.cwd(), '../public/assets/admin/index.js')

describe('production bundle', () => {
  it.skipIf(!existsSync(bundle))('resolves svelte client entry, not the server build', () => {
    expect(readFileSync(bundle, 'utf8')).not.toContain('is not available on the server')
  })
})
