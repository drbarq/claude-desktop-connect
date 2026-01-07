import { useEffect, useRef } from 'react'
import { Conversation } from '../../lib/types'
import { useMessages } from '../../hooks/useMessages'
import { useChat } from '../../hooks/useChat'
import { MessageList } from './MessageList'
import { InputArea } from './InputArea'
import { EmptyState } from './EmptyState'

interface ChatViewProps {
  conversation: Conversation | null
  onConversationUpdate: () => void
  model: string
}

export function ChatView({ conversation, onConversationUpdate, model }: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    messages,
    loading: messagesLoading,
    addMessage,
    appendToLastAssistantMessage,
    updateLastAssistantMessage
  } = useMessages(conversation?.id || null)

  const { isStreaming, error, sendMessage, stopStreaming } = useChat({
    conversationId: conversation?.id || null,
    messages,
    onAddMessage: addMessage,
    onAppendToken: appendToLastAssistantMessage,
    onUpdateMessage: updateLastAssistantMessage
  })

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (content: string) => {
    await sendMessage(content, conversation?.model || model)
    onConversationUpdate()
  }

  if (!conversation) {
    return <EmptyState />
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-claude-border dark:border-claude-border-dark drag">
        <div className="flex items-center gap-2 no-drag">
          <h1 className="font-medium text-gray-800 dark:text-gray-100 truncate max-w-md">
            {conversation.title}
          </h1>
          <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
            {conversation.model}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messagesLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-claude-orange"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            Start a conversation with Claude
          </div>
        ) : (
          <MessageList messages={messages} isStreaming={isStreaming} />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error display */}
      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Input */}
      <InputArea
        onSend={handleSend}
        isStreaming={isStreaming}
        onStop={stopStreaming}
        disabled={!conversation}
      />
    </div>
  )
}
