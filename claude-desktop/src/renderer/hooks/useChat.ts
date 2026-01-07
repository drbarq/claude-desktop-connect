import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import { Message, ChatMessage } from '../lib/types'

interface UseChatOptions {
  conversationId: string | null
  messages: Message[]
  onAddMessage: (role: 'user' | 'assistant', content: string) => Promise<Message | null>
  onAppendToken: (token: string) => void
  onUpdateMessage: (content: string) => void
}

export function useChat({
  conversationId,
  messages,
  onAddMessage,
  onAppendToken,
  onUpdateMessage
}: UseChatOptions) {
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(false)
  const streamingContentRef = useRef('')

  // Set up streaming listeners
  useEffect(() => {
    if (!conversationId) return

    const unsubToken = api.onStreamToken(({ conversationId: cid, token }) => {
      if (cid === conversationId && !abortRef.current) {
        streamingContentRef.current += token
        onAppendToken(token)
      }
    })

    const unsubDone = api.onStreamDone(({ conversationId: cid }) => {
      if (cid === conversationId) {
        setIsStreaming(false)
        // Save the final message to DB
        if (streamingContentRef.current) {
          api.createMessage(conversationId, 'assistant', streamingContentRef.current)
        }
      }
    })

    const unsubError = api.onStreamError(({ conversationId: cid, error }) => {
      if (cid === conversationId) {
        setIsStreaming(false)
        setError(error)
      }
    })

    return () => {
      unsubToken()
      unsubDone()
      unsubError()
    }
  }, [conversationId, onAppendToken])

  const sendMessage = useCallback(
    async (content: string, model: string) => {
      if (!conversationId || !content.trim() || isStreaming) return

      setError(null)
      abortRef.current = false
      streamingContentRef.current = ''

      // Add user message
      await onAddMessage('user', content)

      // Add empty assistant message for streaming
      await onAddMessage('assistant', '')

      setIsStreaming(true)

      // Prepare messages for API
      const chatMessages: ChatMessage[] = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content }
      ]

      try {
        await api.sendChat(conversationId, chatMessages, model)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message')
        setIsStreaming(false)
      }
    },
    [conversationId, messages, isStreaming, onAddMessage]
  )

  const stopStreaming = useCallback(() => {
    abortRef.current = true
    setIsStreaming(false)
  }, [])

  return {
    isStreaming,
    error,
    sendMessage,
    stopStreaming
  }
}
