import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { Message } from '../lib/types'

export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)

  const loadMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([])
      return
    }

    setLoading(true)
    try {
      const msgs = await api.listMessages(conversationId)
      setMessages(msgs)
    } catch (error) {
      console.error('Failed to load messages:', error)
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  const addMessage = useCallback(
    async (role: 'user' | 'assistant', content: string) => {
      if (!conversationId) return null

      const msg = await api.createMessage(conversationId, role, content)
      setMessages((prev) => [...prev, msg])
      return msg
    },
    [conversationId]
  )

  const updateLastAssistantMessage = useCallback((content: string) => {
    setMessages((prev) => {
      const newMessages = [...prev]
      for (let i = newMessages.length - 1; i >= 0; i--) {
        if (newMessages[i].role === 'assistant') {
          newMessages[i] = { ...newMessages[i], content }
          break
        }
      }
      return newMessages
    })
  }, [])

  const appendToLastAssistantMessage = useCallback((token: string) => {
    setMessages((prev) => {
      const newMessages = [...prev]
      for (let i = newMessages.length - 1; i >= 0; i--) {
        if (newMessages[i].role === 'assistant') {
          newMessages[i] = { ...newMessages[i], content: newMessages[i].content + token }
          break
        }
      }
      return newMessages
    })
  }, [])

  return {
    messages,
    loading,
    addMessage,
    updateLastAssistantMessage,
    appendToLastAssistantMessage,
    refreshMessages: loadMessages
  }
}
