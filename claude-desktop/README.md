# Claude Desktop

A native desktop application for chatting with Claude using AWS Bedrock. Built with Electron, React, and TypeScript.

## Features

- **Native Desktop App** - Runs as a proper desktop application on macOS, Windows, and Linux
- **Local Storage** - All conversations stored locally in SQLite
- **AWS Bedrock Integration** - Uses your AWS account for Claude API access
- **Streaming Responses** - Real-time token streaming
- **Multiple Models** - Switch between Opus, Sonnet, and Haiku
- **Dark Mode** - Automatic or manual theme switching
- **Markdown Support** - Full markdown rendering with syntax-highlighted code blocks
- **Keyboard Shortcuts** - Cmd/Ctrl+N for new chat, Cmd/Ctrl+, for settings

## Installation

### Prerequisites

- Node.js 18+
- npm or yarn
- AWS account with Bedrock access
- AWS CLI configured (for SSO or credentials)

### Development

```bash
# Install dependencies
npm install

# Rebuild native modules for Electron
npm run rebuild

# Start development server
npm run dev
```

### Build

```bash
# Build for current platform
npm run build
npm run package

# Build for specific platforms
npm run package:mac    # macOS
npm run package:win    # Windows
npm run package:linux  # Linux
```

## Configuration

### AWS Setup

1. Enable Claude models in AWS Bedrock Console
2. Configure AWS credentials:
   - Via AWS SSO: `aws sso login --profile your-profile`
   - Via environment variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
   - Via credentials file: `~/.aws/credentials`

3. Set your profile in the app's Settings (Cmd/Ctrl+,)

### Settings

Open Settings with **Cmd/Ctrl+,** to configure:
- AWS Profile
- AWS Region
- Default Model
- Theme (Light/Dark/System)

## Project Structure

```
claude-desktop/
├── src/
│   ├── main/           # Electron main process
│   │   ├── index.ts    # App entry point
│   │   ├── bedrock.ts  # AWS Bedrock integration
│   │   ├── database.ts # SQLite operations
│   │   └── ...
│   ├── preload/        # Context bridge
│   │   └── index.ts
│   └── renderer/       # React frontend
│       ├── App.tsx
│       ├── components/
│       ├── hooks/
│       └── ...
├── resources/          # App icons
└── electron-builder.yml
```

## Data Storage

Conversations are stored in SQLite at:
- **macOS**: `~/Library/Application Support/claude-desktop/data/claude.db`
- **Windows**: `%APPDATA%/claude-desktop/data/claude.db`
- **Linux**: `~/.config/claude-desktop/data/claude.db`

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl+N | New Chat |
| Cmd/Ctrl+, | Open Settings |
| Enter | Send Message |
| Shift+Enter | New Line |

## Technology Stack

- **Electron** - Desktop application framework
- **React** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool (via electron-vite)
- **Tailwind CSS** - Styling
- **better-sqlite3** - Local database
- **AWS SDK** - Bedrock integration

## License

MIT
