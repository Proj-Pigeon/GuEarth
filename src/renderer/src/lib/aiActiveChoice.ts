export interface ActiveModelPair {
  providerId: string
  modelId: string
}

/** The default-model select is `allow-clear`, so its value may be `undefined` or `null` after clearing. */
export function parseActiveChoice(choice: unknown): ActiveModelPair {
  const value = typeof choice === 'string' ? choice : ''
  const separatorIndex = value.indexOf(':')
  if (separatorIndex < 0) return { providerId: '', modelId: '' }
  return { providerId: value.slice(0, separatorIndex), modelId: value.slice(separatorIndex + 1) }
}
