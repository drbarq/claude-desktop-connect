import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { Conversation } from '../lib/types'

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshConversations = useCallback(async () => {
    try {
      const convs = await api.listConversations()
      setConversations(convs)
    } catch (error) {
      console.error('Failed to load conversations:', error)
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await refreshConversations()
      setLoading(false)
    }
    load()
  }, [refreshConversations])

  const createConversation = useCallback(async (title: string, model?: string) => {
    const conv = await api.createConversation(title, model)
    setConversations((prev) => [conv, ...prev])
    return conv
  }, [])

  const deleteConversation = useCallback(async (id: string) => {
    await api.deleteConversation(id)
    setConversations((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const renameConversation = useCallback(async (id: string, title: string) => {
    const updated = await api.updateConversation(id, { title })
    if (updated) {
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)))
      setCurrentConversation((prev) => (prev?.id === id ? updated : prev))
    }
  }, [])

  const updateConversationModel = useCallback(async (id: string, model: string) => {
    const updated = await api.updateConversation(id, { model })
    if (updated) {
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)))
      setCurrentConversation((prev) => (prev?.id === id ? updated : prev))
    }
  }, [])

  return {
    conversations,
    currentConversation,
    setCurrentConversation,
    loading,
    createConversation,
    deleteConversation,
    renameConversation,
    updateConversationModel,
    refreshConversations
  }
}
