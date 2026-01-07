import { Message as MessageType } from '../../lib/types'
import { Message } from './Message'

interface MessageListProps {
  messages: MessageType[]
  isStreaming: boolean
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {messages.map((message, index) => {
        const isLastAssistant =
          message.role === 'assistant' && index === messages.length - 1

        return (
          <Message
            key={message.id}
            message={message}
            isStreaming={isLastAssistant && isStreaming}
          />
        )
      })}
    </div>
  )
}
