export function formatActionError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {return error.message.trim()}
  if (typeof error === 'string' && error.trim()) {return error.trim()}
  return '操作失败，请重试'
}

export async function runGuardedAction(
  action: (() => void | Promise<void>) | undefined,
  onError: (message: string) => void
): Promise<boolean> {
  if (!action) {return true}
  try {
    await action()
    return true
  } catch (error) {
    onError(formatActionError(error))
    return false
  }
}
