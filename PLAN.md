# Claude Desktop Clone - Implementation Plan

## Overview

Build a full Claude Desktop replacement using Electron + React that connects to AWS Bedrock with local storage. This will be a standalone desktop application that replicates the Claude Desktop experience.

## Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Desktop Shell | Electron | Same as real Claude Desktop, mature ecosystem |
| Frontend | React + TypeScript | Industry standard, great DX |
| Bundler | electron-vite | Fast, modern, excellent Electron support |
| Styling | TailwindCSS | Rapid UI development, matches Claude's clean aesthetic |
| Database | better-sqlite3 | Synchronous, fast, no native rebuild issues |
| AWS | @aws-sdk/client-bedrock-runtime | Official SDK with streaming support |
| Markdown | react-markdown + remark-gfm | GitHub-flavored markdown |
| Syntax Highlighting | shiki or highlight.js | Code block highlighting |

## Project Structure

```
claude-desktop/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── tailwind.config.js
├── postcss.config.js
├── .gitignore
├── README.md
│
├── src/
│   ├── main/                      # Electron main process
│   │   ├── index.ts               # App entry, window creation
│   │   ├── bedrock.ts             # AWS Bedrock client + streaming
│   │   ├── database.ts            # SQLite operations
│   │   ├── ipc-handlers.ts        # IPC message handlers
│   │   ├── tray.ts                # System tray setup
│   │   ├── menu.ts                # Application menu
│   │   └── store.ts               # Settings persistence
│   │
│   ├── preload/                   # Preload scripts (context bridge)
│   │   └── index.ts               # Expose safe APIs to renderer
│   │
│   └── renderer/                  # React frontend
│       ├── index.html
│       ├── main.tsx               # React entry point
│       ├── App.tsx                # Root component + routing
│       │
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Sidebar.tsx    # Left panel - conversation list
│       │   │   ├── Header.tsx     # Top bar - model selector, settings
│       │   │   └── Layout.tsx     # Main layout wrapper
│       │   │
│       │   ├── chat/
│       │   │   ├── ChatView.tsx   # Main chat container
│       │   │   ├── MessageList.tsx # Scrollable message area
│       │   │   ├── Message.tsx    # Single message (user or assistant)
│       │   │   ├── MessageContent.tsx # Markdown + code rendering
│       │   │   ├── InputArea.tsx  # Message input + send button
│       │   │   └── StreamingText.tsx # Animated streaming display
│       │   │
│       │   ├── sidebar/
│       │   │   ├── ConversationList.tsx
│       │   │   ├── ConversationItem.tsx
│       │   │   ├── NewChatButton.tsx
│       │   │   └── SearchInput.tsx
│       │   │
│       │   ├── settings/
│       │   │   ├── SettingsModal.tsx
│       │   │   ├── AWSSettings.tsx
│       │   │   ├── ModelSettings.tsx
│       │   │   └── AppearanceSettings.tsx
│       │   │
│       │   └── ui/                # Reusable UI primitives
│       │       ├── Button.tsx
│       │       ├── Input.tsx
│       │       ├── Modal.tsx
│       │       ├── Dropdown.tsx
│       │       └── Spinner.tsx
│       │
│       ├── hooks/
│       │   ├── useChat.ts         # Send messages, handle streaming
│       │   ├── useConversations.ts # CRUD conversations
│       │   ├── useMessages.ts     # Load/save messages
│       │   ├── useSettings.ts     # App settings
│       │   └── useAWS.ts          # AWS profile/region management
│       │
│       ├── lib/
│       │   ├── api.ts             # IPC wrapper functions
│       │   ├── types.ts           # TypeScript interfaces
│       │   └── constants.ts       # Model IDs, defaults
│       │
│       └── styles/
│           └── globals.css        # Tailwind directives + custom CSS
│
├── resources/
│   ├── icon.icns                  # macOS icon
│   ├── icon.ico                   # Windows icon
│   ├── icon.png                   # Linux icon
│   └── tray-icon.png              # System tray icon
│
└── electron-builder.yml           # Build/packaging config
```

## Database Schema

```sql
-- Conversations table
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Messages table
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Settings table
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Indexes
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
```

## IPC API Design

### Main → Renderer (Events)
```typescript
// Streaming tokens
'stream:token' → { conversationId: string, token: string }
'stream:done' → { conversationId: string }
'stream:error' → { conversationId: string, error: string }
```

### Renderer → Main (Invoke)
```typescript
// Conversations
'conversations:list' → Conversation[]
'conversations:create' → Conversation
'conversations:update' → Conversation
'conversations:delete' → void

// Messages
'messages:list' → { conversationId: string } → Message[]
'messages:send' → { conversationId: string, content: string, model: string } → void

// Settings
'settings:get' → { key: string } → string | null
'settings:set' → { key: string, value: string } → void
'settings:getAll' → Record<string, string>

// AWS
'aws:listProfiles' → string[]
'aws:testConnection' → { profile: string, region: string } → boolean
```

## Implementation Phases

### Phase 1: Project Scaffold
- [ ] Initialize electron-vite project
- [ ] Configure TypeScript (3 configs: main, preload, renderer)
- [ ] Set up Tailwind CSS
- [ ] Create basic window with React
- [ ] Verify hot reload works

### Phase 2: Database Layer
- [ ] Install better-sqlite3
- [ ] Create database initialization
- [ ] Implement conversation CRUD
- [ ] Implement message CRUD
- [ ] Implement settings storage

### Phase 3: IPC Bridge
- [ ] Define TypeScript types for all IPC calls
- [ ] Implement preload script with contextBridge
- [ ] Create IPC handlers in main process
- [ ] Create api.ts wrapper in renderer

### Phase 4: AWS Bedrock Integration
- [ ] Set up @aws-sdk/client-bedrock-runtime
- [ ] Implement credential loading (profile-based)
- [ ] Implement ConverseStream for streaming
- [ ] Handle streaming events → IPC events
- [ ] Add model mapping (opus/sonnet/haiku → Bedrock IDs)

### Phase 5: Chat UI
- [ ] Create Message component with markdown
- [ ] Create MessageList with auto-scroll
- [ ] Create InputArea with textarea + submit
- [ ] Implement streaming text display
- [ ] Add code block syntax highlighting
- [ ] Add copy button for code blocks

### Phase 6: Sidebar + Conversations
- [ ] Create ConversationList component
- [ ] Create ConversationItem with context menu
- [ ] Implement new chat creation
- [ ] Implement delete conversation
- [ ] Implement rename conversation
- [ ] Add search/filter

### Phase 7: Settings
- [ ] Create Settings modal
- [ ] AWS profile dropdown (read from ~/.aws/config)
- [ ] Region selector
- [ ] Model selector
- [ ] System prompt toggle
- [ ] Persist settings to database

### Phase 8: Desktop Features
- [ ] System tray with menu
- [ ] Global keyboard shortcut
- [ ] Remember window position/size
- [ ] Minimize to tray option
- [ ] Native notifications for long responses

### Phase 9: Polish
- [ ] Loading states and skeletons
- [ ] Error handling and toasts
- [ ] Empty states
- [ ] Keyboard shortcuts (Cmd+N, Cmd+K, etc.)
- [ ] Dark mode support
- [ ] App icons (macOS, Windows, Linux)

### Phase 10: Build & Distribution
- [ ] Configure electron-builder
- [ ] macOS: DMG + code signing
- [ ] Windows: NSIS installer
- [ ] Linux: AppImage + deb
- [ ] Auto-update support (optional)

## UI Design Notes

Claude Desktop's aesthetic:
- **Colors**: White background, subtle gray borders, coral/orange accent (#E07A5F or similar)
- **Typography**: System font (SF Pro on Mac), clean sans-serif
- **Spacing**: Generous padding, not cramped
- **Messages**: No heavy bubbles, subtle background differentiation
- **Code blocks**: Dark background (#1e1e1e), syntax highlighting
- **Animations**: Smooth fade-ins, subtle transitions

## Key Files to Create First

1. `package.json` - Dependencies and scripts
2. `electron.vite.config.ts` - Build configuration
3. `src/main/index.ts` - Electron entry point
4. `src/preload/index.ts` - Context bridge
5. `src/renderer/main.tsx` - React entry
6. `src/renderer/App.tsx` - Root component
7. `src/main/database.ts` - SQLite setup
8. `src/main/bedrock.ts` - AWS integration

## Dependencies

```json
{
  "dependencies": {
    "@aws-sdk/client-bedrock-runtime": "^3.x",
    "@aws-sdk/credential-providers": "^3.x",
    "better-sqlite3": "^9.x",
    "react": "^18.x",
    "react-dom": "^18.x",
    "react-markdown": "^9.x",
    "remark-gfm": "^4.x",
    "shiki": "^1.x",
    "uuid": "^9.x"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.x",
    "@types/react": "^18.x",
    "@types/react-dom": "^18.x",
    "@types/uuid": "^9.x",
    "@vitejs/plugin-react": "^4.x",
    "autoprefixer": "^10.x",
    "electron": "^28.x",
    "electron-builder": "^24.x",
    "electron-vite": "^2.x",
    "postcss": "^8.x",
    "tailwindcss": "^3.x",
    "typescript": "^5.x",
    "vite": "^5.x"
  }
}
```

## Success Criteria

- [ ] App launches and displays chat UI
- [ ] Can create/switch/delete conversations
- [ ] Messages stream in real-time from Bedrock
- [ ] Markdown and code blocks render correctly
- [ ] Settings persist across restarts
- [ ] Works with AWS SSO profiles
- [ ] Builds to installable packages for macOS/Windows/Linux
