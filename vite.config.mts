import { liangmi } from '@liangmi/vp-config'

export default liangmi({
  // Lint rules and formatting are enabled in follow-ups. Until then, `vp check` only type-checks.
  check: { fmt: false, lint: false },
  test: {
    environment: 'node',
    include: ['tests/*.test.mjs'],
    experimental: { viteModuleRunner: false }
  }
})
