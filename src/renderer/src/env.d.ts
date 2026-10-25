import type { HubApi } from '../../preload'

declare global {
  interface Window {
    hub?: HubApi
  }
}
