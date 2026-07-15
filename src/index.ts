import { CURSOR_PROVIDER_ID } from "./shared.js"
import { createCursorLanguageModel } from "./language-model.js"
import { CursorPlugin } from "./plugin.js"

export type CreateCursorOptions = {
  name: string
  accessToken?: string
  apiKey?: string
  baseURL?: string
  headers?: Record<string, string>
  /** OpenCode project / worktree directory for request_context collectors. */
  workspaceRoot?: string
}

export function createCursor(options: CreateCursorOptions) {
  const providerId = options.name || CURSOR_PROVIDER_ID
  return {
    languageModel(modelId: string) {
      return createCursorLanguageModel(modelId, providerId, options)
    },
  }
}

export { CursorPlugin }
export default CursorPlugin
