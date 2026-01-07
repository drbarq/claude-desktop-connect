import { ipcMain, BrowserWindow } from 'electron'
import {
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  listMessages,
  createMessage,
  updateMessage,
  getSetting,
  setSetting,
  getAllSettings
} from './database'
import { streamChat, listAwsProfiles, testAwsConnection, ChatMessage } from './bedrock'
import { getMainWindow } from './index'

export function registerIpcHandlers(): void {
  // Conversation handlers
  ipcMain.handle('conversations:list', () => {
    return listConversations()
  })

  ipcMain.handle('conversations:get', (_, id: string) => {
    return getConversation(id)
  })

  ipcMain.handle('conversations:create', (_, title: string, model?: string) => {
    return createConversation(title, model)
  })

  ipcMain.handle('conversations:update', (_, id: string, updates: { title?: string; model?: string }) => {
    return updateConversation(id, updates)
  })

  ipcMain.handle('conversations:delete', (_, id: string) => {
    deleteConversation(id)
    return true
  })

  // Message handlers
  ipcMain.handle('messages:list', (_, conversationId: string) => {
    return listMessages(conversationId)
  })

  ipcMain.handle('messages:create', (_, conversationId: string, role: 'user' | 'assistant', content: string) => {
    return createMessage(conversationId, role, content)
  })

  ipcMain.handle('messages:update', (_, id: string, content: string) => {
    updateMessage(id, content)
    return true
  })

  // Chat/streaming handler
  ipcMain.handle(
    'chat:send',
    async (_, conversationId: string, messages: ChatMessage[], model: string, workingDir?: string) => {
      const window = getMainWindow()
      if (!window) throw new Error('No main window')

      // Create user message in DB is handled by renderer before calling this
      const response = await streamChat(window, conversationId, messages, model, workingDir)
      return response
    }
  )

  // Settings handlers
  ipcMain.handle('settings:get', (_, key: string) => {
    return getSetting(key)
  })

  ipcMain.handle('settings:set', (_, key: string, value: string) => {
    setSetting(key, value)
    return true
  })

  ipcMain.handle('settings:getAll', () => {
    return getAllSettings()
  })

  // AWS handlers
  ipcMain.handle('aws:listProfiles', async () => {
    return listAwsProfiles()
  })

  ipcMain.handle('aws:testConnection', async (_, profile: string, region: string) => {
    return testAwsConnection(profile, region)
  })
}
