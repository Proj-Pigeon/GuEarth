import { memo, type FC } from 'react'
import { useMessagePartText } from '@assistant-ui/react'
import StreamingMarkdown from '../StreamingMarkdown'

const EoqMarkdownTextImpl: FC = () => {
  const { text, status } = useMessagePartText()
  return <StreamingMarkdown text={text} streaming={status.type === 'running'} />
}

export const EoqMarkdownText = memo(EoqMarkdownTextImpl)

export default EoqMarkdownText
