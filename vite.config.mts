import { liangmi } from '@liangmi/vp-config'

export default liangmi({ fmt: { ignorePatterns: ['resources/licenses/**'] } }).only(['fmt'])
