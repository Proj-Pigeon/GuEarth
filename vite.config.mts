import { liangmi } from '@liangmi/vp-config'

export default liangmi({
  test: { experimental: { viteModuleRunner: false } },
  check: { lint: false },
  fmt: { ignorePatterns: ['resources/licenses/**'] }
}).only(['fmt'])
