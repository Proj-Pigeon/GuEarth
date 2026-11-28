import type { GuEarthApi } from './index'

declare global {
  interface Window {
    guEarth: GuEarthApi
  }
}
