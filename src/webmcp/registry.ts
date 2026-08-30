import { initializeWebMCPPolyfill } from '@mcp-b/webmcp-polyfill'
import type { ChromeModelContext } from '@mcp-b/webmcp-types'
import { useWavecraftStore } from '../store/wavecraftStore'
import { createWavecraftTools } from './tools'

let registrationPromise: Promise<void> | null = null
let registrationController: AbortController | null = null

export function registerWavecraftTools() {
  if (registrationPromise) return registrationPromise
  const hadNativeContext = 'modelContext' in document && Boolean(document.modelContext)
  initializeWebMCPPolyfill({ installTestingShim: true })
  const context = document.modelContext as ChromeModelContext | undefined
  if (!context) {
    useWavecraftStore.getState().setWebMCPStatus('unavailable', 0)
    return Promise.resolve()
  }
  registrationController = new AbortController()
  const tools = createWavecraftTools()
  registrationPromise = Promise.all(tools.map((definition) => context.registerTool(definition, { signal: registrationController!.signal })))
    .then(() => { useWavecraftStore.getState().setWebMCPStatus(hadNativeContext ? 'native' : 'polyfill', tools.length) })
    .catch((error) => {
      useWavecraftStore.getState().setWebMCPStatus('error', 0)
      console.error('Wavecraft WebMCP registration failed', error)
      throw error
    })
  return registrationPromise
}

export function unregisterWavecraftTools() {
  registrationController?.abort()
  registrationController = null
  registrationPromise = null
}
