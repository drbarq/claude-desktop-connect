import { contextBridge, ipcRenderer } from 'electron'

export interface Conversation {
  id: string
  title: string
  model: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('api', {
  // Conversations
  listConversations: (): Promise<Conversation[]> => ipcRenderer.invoke('conversations:list'),
  getConversation: (id: string): Promise<Conversation | null> =>
    ipcRenderer.invoke('conversations:get', id),
  createConversation: (title: string, model?: string): Promise<Conversation> =>
    ipcRenderer.invoke('conversations:create', title, model),
  updateConversation: (
    id: string,
    updates: { title?: string; model?: string }
  ): Promise<Conversation | null> => ipcRenderer.invoke('conversations:update', id, updates),
  deleteConversation: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('conversations:delete', id),

  // Messages
  listMessages: (conversationId: string): Promise<Message[]> =>
    ipcRenderer.invoke('messages:list', conversationId),
  createMessage: (
    conversationId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<Message> => ipcRenderer.invoke('messages:create', conversationId, role, content),
  updateMessage: (id: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke('messages:update', id, content),

  // Chat
  sendChat: (conversationId: string, messages: ChatMessage[], model: string): Promise<string> =>
    ipcRenderer.invoke('chat:send', conversationId, messages, model),

  // Settings
  getSetting: (key: string): Promise<string | null> => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: string): Promise<boolean> =>
    ipcRenderer.invoke('settings:set', key, value),
  getAllSettings: (): Promise<Record<string, string>> => ipcRenderer.invoke('settings:getAll'),

  // AWS
  listAwsProfiles: (): Promise<string[]> => ipcRenderer.invoke('aws:listProfiles'),
  testAwsConnection: (profile: string, region: string): Promise<boolean> =>
    ipcRenderer.invoke('aws:testConnection', profile, region),

  // Event listeners
  onStreamToken: (callback: (data: { conversationId: string; token: string }) => void) => {
    const listener = (_: Electron.IpcRendererEvent, data: { conversationId: string; token: string }) => callback(data)
    ipcRenderer.on('stream:token', listener)
    return () => ipcRenderer.removeListener('stream:token', listener)
  },
  onStreamDone: (callback: (data: { conversationId: string }) => void) => {
    const listener = (_: Electron.IpcRendererEvent, data: { conversationId: string }) => callback(data)
    ipcRenderer.on('stream:done', listener)
    return () => ipcRenderer.removeListener('stream:done', listener)
  },
  onStreamError: (callback: (data: { conversationId: string; error: string }) => void) => {
    const listener = (_: Electron.IpcRendererEvent, data: { conversationId: string; error: string }) => callback(data)
    ipcRenderer.on('stream:error', listener)
    return () => ipcRenderer.removeListener('stream:error', listener)
  },
  onThemeChanged: (callback: (isDark: boolean) => void) => {
    const listener = (_: Electron.IpcRendererEvent, isDark: boolean) => callback(isDark)
    ipcRenderer.on('theme:changed', listener)
    return () => ipcRenderer.removeListener('theme:changed', listener)
  },
  onNewChat: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('shortcut:newChat', listener)
    return () => ipcRenderer.removeListener('shortcut:newChat', listener)
  },
  onOpenSettings: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('shortcut:settings', listener)
    return () => ipcRenderer.removeListener('shortcut:settings', listener)
  }
})

// Type declaration for renderer
declare global {
  interface Window {
    api: {
      listConversations: () => Promise<Conversation[]>
      getConversation: (id: string) => Promise<Conversation | null>
      createConversation: (title: string, model?: string) => Promise<Conversation>
      updateConversation: (
        id: string,
        updates: { title?: string; model?: string }
      ) => Promise<Conversation | null>
      deleteConversation: (id: string) => Promise<boolean>
      listMessages: (conversationId: string) => Promise<Message[]>
      createMessage: (
        conversationId: string,
        role: 'user' | 'assistant',
        content: string
      ) => Promise<Message>
      updateMessage: (id: string, content: string) => Promise<boolean>
      sendChat: (conversationId: string, messages: ChatMessage[], model: string) => Promise<string>
      getSetting: (key: string) => Promise<string | null>
      setSetting: (key: string, value: string) => Promise<boolean>
      getAllSettings: () => Promise<Record<string, string>>
      listAwsProfiles: () => Promise<string[]>
      testAwsConnection: (profile: string, region: string) => Promise<boolean>
      onStreamToken: (
        callback: (data: { conversationId: string; token: string }) => void
      ) => () => void
      onStreamDone: (callback: (data: { conversationId: string }) => void) => () => void
      onStreamError: (
        callback: (data: { conversationId: string; error: string }) => void
      ) => () => void
      onThemeChanged: (callback: (isDark: boolean) => void) => () => void
      onNewChat: (callback: () => void) => () => void
      onOpenSettings: (callback: () => void) => () => void
    }
  }
}
