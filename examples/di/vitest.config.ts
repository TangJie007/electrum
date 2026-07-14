import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/06-smoke.ts'],
  },
})
