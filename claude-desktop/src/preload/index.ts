import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

export interface ElectronAPI {
  // Conversations
  listConversations: () => Promise<any[]>
  getConversation: (id: string) => Promise<any>
  createConversation: (title: string, model?: string) => Promise<any>
  updateConversation: (id: string, updates: { title?: string; model?: string }) => Promise<any>
  deleteConversation: (id: string) => Promise<boolean>

  // Messages
  listMessages: (conversationId: string) => Promise<any[]>
  createMessage: (conversationId: string, role: 'user' | 'assistant', content: string) => Promise<any>
  updateMessage: (id: string, content: string) => Promise<boolean>

  // Chat
  sendChat: (
    conversationId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    model: string,
    workingDir?: string
  ) => Promise<string>

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
  onToolUse: (callback: (data: { conversationId: string; tool: string; status: string; input?: unknown; result?: string }) => void) => () => void
  onNewChat: (callback: () => void) => () => void
  onOpenSettings: (callback: () => void) => () => void
  onThemeChanged: (callback: (isDark: boolean) => void) => () => void
}

const electronAPI: ElectronAPI = {
  // Conversations
  listConversations: () => ipcRenderer.invoke('conversations:list'),
  getConversation: (id) => ipcRenderer.invoke('conversations:get', id),
  createConversation: (title, model) => ipcRenderer.invoke('conversations:create', title, model),
  updateConversation: (id, updates) => ipcRenderer.invoke('conversations:update', id, updates),
  deleteConversation: (id) => ipcRenderer.invoke('conversations:delete', id),

  // Messages
  listMessages: (conversationId) => ipcRenderer.invoke('messages:list', conversationId),
  createMessage: (conversationId, role, content) =>
    ipcRenderer.invoke('messages:create', conversationId, role, content),
  updateMessage: (id, content) => ipcRenderer.invoke('messages:update', id, content),

  // Chat
  sendChat: (conversationId, messages, model, workingDir) =>
    ipcRenderer.invoke('chat:send', conversationId, messages, model, workingDir),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  getAllSettings: () => ipcRenderer.invoke('settings:getAll'),

  // AWS
  listAwsProfiles: () => ipcRenderer.invoke('aws:listProfiles'),
  testAwsConnection: (profile, region) => ipcRenderer.invoke('aws:testConnection', profile, region),

  // Event listeners
  onStreamToken: (callback) => {
    const handler = (_event: IpcRendererEvent, data: { conversationId: string; token: string }) =>
      callback(data)
    ipcRenderer.on('stream:token', handler)
    return () => ipcRenderer.removeListener('stream:token', handler)
  },

  onStreamDone: (callback) => {
    const handler = (_event: IpcRendererEvent, data: { conversationId: string }) => callback(data)
    ipcRenderer.on('stream:done', handler)
    return () => ipcRenderer.removeListener('stream:done', handler)
  },

  onStreamError: (callback) => {
    const handler = (
      _event: IpcRendererEvent,
      data: { conversationId: string; error: string }
    ) => callback(data)
    ipcRenderer.on('stream:error', handler)
    return () => ipcRenderer.removeListener('stream:error', handler)
  },

  onToolUse: (callback) => {
    const handler = (
      _event: IpcRendererEvent,
      data: { conversationId: string; tool: string; status: string; input?: unknown; result?: string }
    ) => callback(data)
    ipcRenderer.on('stream:toolUse', handler)
    return () => ipcRenderer.removeListener('stream:toolUse', handler)
  },

  onNewChat: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('shortcut:newChat', handler)
    return () => ipcRenderer.removeListener('shortcut:newChat', handler)
  },

  onOpenSettings: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('shortcut:settings', handler)
    return () => ipcRenderer.removeListener('shortcut:settings', handler)
  },

  onThemeChanged: (callback) => {
    const handler = (_event: IpcRendererEvent, isDark: boolean) => callback(isDark)
    ipcRenderer.on('theme:changed', handler)
    return () => ipcRenderer.removeListener('theme:changed', handler)
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)
