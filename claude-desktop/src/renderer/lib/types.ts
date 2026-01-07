export interface Conversation {
  id: string
  title: string
  model?: string
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface Settings {
  aws_profile?: string
  aws_region?: string
  model?: string
  theme?: 'light' | 'dark' | 'system'
  use_system_prompt?: boolean
}
