export interface TextMeasureContext {
  measureText(text: string): { width: number }
}

export function wrapText(context: TextMeasureContext, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const character of text) {
    if (character === '\n') {
      lines.push(line)
      line = ''
      continue
    }
    const candidate = line + character
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line)
      line = character
    } else line = candidate
  }
  if (line) lines.push(line)
  return lines.slice(0, 3)
}
