import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'

let db: Database.Database | null = null

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

export function initDatabase(): void {
  const userDataPath = app.getPath('userData')
  const dbDir = join(userDataPath, 'data')

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  const dbPath = join(dbDir, 'claude.db')
  db = new Database(dbPath)

  // Enable foreign keys
  db.pragma('foreign_keys = ON')

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'sonnet',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
  `)
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

// Conversation operations
export function listConversations(): Conversation[] {
  const stmt = getDatabase().prepare(`
    SELECT * FROM conversations ORDER BY updated_at DESC
  `)
  return stmt.all() as Conversation[]
}

export function getConversation(id: string): Conversation | null {
  const stmt = getDatabase().prepare('SELECT * FROM conversations WHERE id = ?')
  return (stmt.get(id) as Conversation) || null
}

export function createConversation(title: string, model: string = 'sonnet'): Conversation {
  const id = uuidv4()
  const stmt = getDatabase().prepare(`
    INSERT INTO conversations (id, title, model) VALUES (?, ?, ?)
  `)
  stmt.run(id, title, model)
  return getConversation(id)!
}

export function updateConversation(
  id: string,
  updates: { title?: string; model?: string }
): Conversation | null {
  const fields: string[] = []
  const values: (string | undefined)[] = []

  if (updates.title !== undefined) {
    fields.push('title = ?')
    values.push(updates.title)
  }
  if (updates.model !== undefined) {
    fields.push('model = ?')
    values.push(updates.model)
  }

  if (fields.length === 0) return getConversation(id)

  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)

  const stmt = getDatabase().prepare(`
    UPDATE conversations SET ${fields.join(', ')} WHERE id = ?
  `)
  stmt.run(...values)
  return getConversation(id)
}

export function deleteConversation(id: string): void {
  const stmt = getDatabase().prepare('DELETE FROM conversations WHERE id = ?')
  stmt.run(id)
}

// Message operations
export function listMessages(conversationId: string): Message[] {
  const stmt = getDatabase().prepare(`
    SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC
  `)
  return stmt.all(conversationId) as Message[]
}

export function createMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string
): Message {
  const id = uuidv4()
  const stmt = getDatabase().prepare(`
    INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)
  `)
  stmt.run(id, conversationId, role, content)

  // Update conversation's updated_at
  const updateStmt = getDatabase().prepare(`
    UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `)
  updateStmt.run(conversationId)

  const msgStmt = getDatabase().prepare('SELECT * FROM messages WHERE id = ?')
  return msgStmt.get(id) as Message
}

export function updateMessage(id: string, content: string): void {
  const stmt = getDatabase().prepare('UPDATE messages SET content = ? WHERE id = ?')
  stmt.run(content, id)
}

export function deleteMessage(id: string): void {
  const stmt = getDatabase().prepare('DELETE FROM messages WHERE id = ?')
  stmt.run(id)
}

// Settings operations
export function getSetting(key: string): string | null {
  const stmt = getDatabase().prepare('SELECT value FROM settings WHERE key = ?')
  const result = stmt.get(key) as { value: string } | undefined
  return result?.value ?? null
}

export function setSetting(key: string, value: string): void {
  const stmt = getDatabase().prepare(`
    INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
  `)
  stmt.run(key, value)
}

export function getAllSettings(): Record<string, string> {
  const stmt = getDatabase().prepare('SELECT key, value FROM settings')
  const rows = stmt.all() as Array<{ key: string; value: string }>
  return Object.fromEntries(rows.map((row) => [row.key, row.value]))
}
