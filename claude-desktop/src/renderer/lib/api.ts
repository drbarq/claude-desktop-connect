import type { Conversation, Message, ChatMessage } from './types'

interface ElectronAPI {
  // Conversations
  listConversations: () => Promise<Conversation[]>
  getConversation: (id: string) => Promise<Conversation | null>
  createConversation: (title: string, model?: string) => Promise<Conversation>
  updateConversation: (id: string, updates: { title?: string; model?: string }) => Promise<Conversation | null>
  deleteConversation: (id: string) => Promise<boolean>

  // Messages
  listMessages: (conversationId: string) => Promise<Message[]>
  createMessage: (conversationId: string, role: 'user' | 'assistant', content: string) => Promise<Message>
  updateMessage: (id: string, content: string) => Promise<boolean>

  // Chat
  sendChat: (conversationId: string, messages: ChatMessage[], model: string) => Promise<string>

  // Settings
  getSetting: (key: string) => Promise<string | null>
  setSetting: (key: string, value: string) => Promise<boolean>
  getAllSettings: () => Promise<Record<string, string>>

  // AWS
  listAwsProfiles: () => Promise<string[]>
  testAwsConnection: (profile: string, region: string) => Promise<boolean>

  // Event listeners
  onStreamToken: (callback: (data: { conversationId: string; token: string }) => void) => () => void
  onStreamDone: (callback: (data: { conversationId: string }) => void) => () => void
  onStreamError: (callback: (data: { conversationId: string; error: string }) => void) => () => void
  onNewChat: (callback: () => void) => () => void
  onOpenSettings: (callback: () => void) => () => void
  onThemeChanged: (callback: (isDark: boolean) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}

export const api: ElectronAPI = {
  // Conversations
  listConversations: () => window.electron.listConversations(),
  getConversation: (id) => window.electron.getConversation(id),
  createConversation: (title, model) => window.electron.createConversation(title, model),
  updateConversation: (id, updates) => window.electron.updateConversation(id, updates),
  deleteConversation: (id) => window.electron.deleteConversation(id),

  // Messages
  listMessages: (conversationId) => window.electron.listMessages(conversationId),
  createMessage: (conversationId, role, content) =>
    window.electron.createMessage(conversationId, role, content),
  updateMessage: (id, content) => window.electron.updateMessage(id, content),

  // Chat
  sendChat: (conversationId, messages, model) =>
    window.electron.sendChat(conversationId, messages, model),

  // Settings
  getSetting: (key) => window.electron.getSetting(key),
  setSetting: (key, value) => window.electron.setSetting(key, value),
  getAllSettings: () => window.electron.getAllSettings(),

  // AWS
  listAwsProfiles: () => window.electron.listAwsProfiles(),
  testAwsConnection: (profile, region) => window.electron.testAwsConnection(profile, region),

  // Event listeners
  onStreamToken: (callback) => window.electron.onStreamToken(callback),
  onStreamDone: (callback) => window.electron.onStreamDone(callback),
  onStreamError: (callback) => window.electron.onStreamError(callback),
  onNewChat: (callback) => window.electron.onNewChat(callback),
  onOpenSettings: (callback) => window.electron.onOpenSettings(callback),
  onThemeChanged: (callback) => window.electron.onThemeChanged(callback)
}
