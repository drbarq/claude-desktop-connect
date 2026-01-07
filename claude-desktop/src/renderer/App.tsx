import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { ChatView } from './components/chat/ChatView'
import { SettingsModal } from './components/settings/SettingsModal'
import { useConversations } from './hooks/useConversations'
import { useSettings } from './hooks/useSettings'
import { api } from './lib/api'
import { getModelShortName } from './lib/constants'

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isDark, setIsDark] = useState(false)

  const {
    conversations,
    currentConversation,
    setCurrentConversation,
    createConversation,
    deleteConversation,
    renameConversation,
    refreshConversations
  } = useConversations()

  const { settings, updateSetting, refreshSettings } = useSettings()

  // Handle theme
  useEffect(() => {
    const theme = settings.theme || 'system'
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      setIsDark(mediaQuery.matches)
      const handler = (e: MediaQueryListEvent) => setIsDark(e.matches)
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    } else {
      setIsDark(theme === 'dark')
    }
  }, [settings.theme])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  // Handle keyboard shortcuts from main process
  useEffect(() => {
    const unsubNewChat = api.onNewChat(() => {
      handleNewChat()
    })
    const unsubSettings = api.onOpenSettings(() => {
      setSettingsOpen(true)
    })
    const unsubTheme = api.onThemeChanged((dark) => {
      if (settings.theme === 'system') {
        setIsDark(dark)
      }
    })

    return () => {
      unsubNewChat()
      unsubSettings()
      unsubTheme()
    }
  }, [settings.theme])

  const handleNewChat = useCallback(async () => {
    const model = settings.model || 'sonnet'
    const modelName = getModelShortName(model)
    const conversation = await createConversation(`New Chat`, model)
    setCurrentConversation(conversation)
  }, [createConversation, setCurrentConversation, settings.model])

  const handleSelectConversation = useCallback(
    (id: string) => {
      const conv = conversations.find((c) => c.id === id)
      if (conv) {
        setCurrentConversation(conv)
      }
    },
    [conversations, setCurrentConversation]
  )

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await deleteConversation(id)
      if (currentConversation?.id === id) {
        setCurrentConversation(null)
      }
    },
    [deleteConversation, currentConversation, setCurrentConversation]
  )

  return (
    <div className={`flex h-screen bg-claude-bg dark:bg-claude-bg-dark`}>
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        conversations={conversations}
        currentConversationId={currentConversation?.id}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={renameConversation}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <ChatView
          conversation={currentConversation}
          onConversationUpdate={refreshConversations}
          model={settings.model || 'sonnet'}
        />
      </main>

      {/* Settings modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdateSetting={updateSetting}
        onRefresh={refreshSettings}
      />
    </div>
  )
}
