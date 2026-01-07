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
  sendChat: (conversationId: string, messages: ChatMessage[], model: string, workingDir?: string) => Promise<string>

  // Settings
  getSetting: (key: string) => Promise<string | null>
  setSetting: (key: string, value: string) => Promise<boolean>
  getAllSettings: () => Promise<Record<string, string>>

  // AWS
  listAwsProfiles: () => Promise<string[]>
  testAwsConnection: (profile: string, region: string) => Promise<boolean>

  // MCP
  mcpGetStatus: () => Promise<Array<{ name: string; connected: boolean; toolCount: number }>>
  mcpGetConfig: () => Promise<{ mcpServers: Record<string, { command: string; args?: string[]; env?: Record<string, string> }> }>
  mcpSaveConfig: (config: { mcpServers: Record<string, { command: string; args?: string[]; env?: Record<string, string> }> }) => Promise<boolean>
  mcpReconnect: () => Promise<Array<{ name: string; connected: boolean; toolCount: number }>>
  mcpGetConfigPath: () => Promise<string>
  mcpOpenConfigFile: () => Promise<boolean>
  mcpGetTools: () => Promise<Array<{ serverName: string; tool: { name: string; description?: string } }>>

  // Event listeners
  onStreamToken: (callback: (data: { conversationId: string; token: string }) => void) => () => void
  onStreamDone: (callback: (data: { conversationId: string }) => void) => () => void
  onStreamError: (callback: (data: { conversationId: string; error: string }) => void) => () => void
  onToolUse: (callback: (data: { conversationId: string; tool: string; status: string; input?: unknown; result?: string }) => void) => () => void
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
  sendChat: (conversationId, messages, model, workingDir) =>
    window.electron.sendChat(conversationId, messages, model, workingDir),

  // Settings
  getSetting: (key) => window.electron.getSetting(key),
  setSetting: (key, value) => window.electron.setSetting(key, value),
  getAllSettings: () => window.electron.getAllSettings(),

  // AWS
  listAwsProfiles: () => window.electron.listAwsProfiles(),
  testAwsConnection: (profile, region) => window.electron.testAwsConnection(profile, region),

  // MCP
  mcpGetStatus: () => window.electron.mcpGetStatus(),
  mcpGetConfig: () => window.electron.mcpGetConfig(),
  mcpSaveConfig: (config) => window.electron.mcpSaveConfig(config),
  mcpReconnect: () => window.electron.mcpReconnect(),
  mcpGetConfigPath: () => window.electron.mcpGetConfigPath(),
  mcpOpenConfigFile: () => window.electron.mcpOpenConfigFile(),
  mcpGetTools: () => window.electron.mcpGetTools(),

  // Event listeners
  onStreamToken: (callback) => window.electron.onStreamToken(callback),
  onStreamDone: (callback) => window.electron.onStreamDone(callback),
  onStreamError: (callback) => window.electron.onStreamError(callback),
  onToolUse: (callback) => window.electron.onToolUse(callback),
  onNewChat: (callback) => window.electron.onNewChat(callback),
  onOpenSettings: (callback) => window.electron.onOpenSettings(callback),
  onThemeChanged: (callback) => window.electron.onThemeChanged(callback)
}
