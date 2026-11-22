import { liangmi } from '@liangmi/vp-config'

export default liangmi({
  check: { lint: false },
  fmt: { ignorePatterns: ['resources/licenses/**'] }
}).only(['fmt'])
