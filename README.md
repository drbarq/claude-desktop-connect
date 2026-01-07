# Bedrock Anthropic Proxy

Use **AWS Bedrock** with any Anthropic-compatible client, or run the included **Claude Desktop replacement** with local chat storage!

## What We Discovered

After extracting and analyzing the official Claude Desktop app, we found:

- **Claude Desktop is a WebView wrapper** - it loads `claude.ai` in a browser view
- **API calls come from the web app**, not the Electron app itself
- **Chats are stored on Anthropic's servers**, synced to your account
- **System prompts are injected server-side**

This means patching the Electron app won't redirect API calls. Instead, we built a **complete local replacement**.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Your Options                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Option A: Full Replacement (Recommended)                           │
│  ┌──────────────────┐     ┌─────────────────┐                       │
│  │  Streamlit Chat  │────▶│   AWS Bedrock   │                       │
│  │  (local storage) │     │  (Claude Opus)  │                       │
│  └──────────────────┘     └─────────────────┘                       │
│  - Local SQLite database for all chats                              │
│  - Official Claude system prompt included                           │
│  - No Anthropic account needed                                      │
│                                                                      │
│  Option B: API Proxy                                                │
│  ┌──────────────────┐     ┌─────────────────┐     ┌──────────────┐ │
│  │  Any Anthropic   │────▶│  Bedrock Proxy  │────▶│  AWS Bedrock │ │
│  │  Client (SDK)    │     │  (localhost)    │     │              │ │
│  └──────────────────┘     └─────────────────┘     └──────────────┘ │
│  - Claude Code, Python SDK, curl, etc.                              │
│  - Drop-in replacement for api.anthropic.com                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Option A: Claude Desktop Replacement (Recommended)

A full-featured chat interface that replicates Claude Desktop functionality with local storage.

### Features

- **Local SQLite storage** - All conversations stored in `~/.config/claude-bedrock/chats.db`
- **Official Claude system prompt** - Authentic Claude behavior (from Anthropic's public docs)
- **Conversation history** - Sidebar with all your chats
- **Export/Import** - Backup and restore conversations as JSON
- **Multiple models** - Switch between Opus, Sonnet, Haiku
- **Streaming responses** - Real-time token streaming
- **No Anthropic account** - Everything runs on your AWS account

### Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Configure AWS credentials
export AWS_PROFILE=your-profile  # or use environment variables
export AWS_REGION=us-east-1

# 3. Run the chat
streamlit run bedrock_chat.py
```

Open `http://localhost:8501` and start chatting!

### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `AWS_REGION` | `us-east-1` | AWS region for Bedrock |
| `AWS_PROFILE` | (none) | AWS profile to use |
| `USE_SYSTEM_PROMPT` | `true` | Inject official Claude system prompt |

### Data Storage

All data is stored locally:
- **Database**: `~/.config/claude-bedrock/chats.db`
- **Format**: SQLite with conversations and messages tables

---

## Option B: API Proxy

A drop-in replacement for `api.anthropic.com` that routes requests to Bedrock.

### Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Configure AWS credentials
export AWS_PROFILE=your-profile
export AWS_REGION=us-east-1

# 3. Run the proxy
python bedrock_proxy.py

# 4. Point your client at it
export ANTHROPIC_BASE_URL=http://localhost:8080
export ANTHROPIC_API_KEY=dummy  # Required by some clients but not used
```

### Usage Examples

#### With the Anthropic Python SDK

```python
from anthropic import Anthropic

client = Anthropic(
    base_url="http://localhost:8080",
    api_key="dummy"  # Not used, but required
)

response = client.messages.create(
    model="opus",  # Maps to Claude Opus 4 on Bedrock
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.content[0].text)
```

#### With Claude Code

```bash
# Terminal 1: Run the Bedrock proxy
python bedrock_proxy.py

# Terminal 2: Configure Claude Code
export ANTHROPIC_BASE_URL=http://localhost:8080
export ANTHROPIC_API_KEY=dummy
claude
```

#### With curl

```bash
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "opus",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Model Mapping

The proxy automatically maps friendly model names to Bedrock inference profile IDs:

| Model Name | Bedrock ID |
|------------|------------|
| `opus` | `us.anthropic.claude-opus-4-20250514-v1:0` |
| `sonnet` | `global.anthropic.claude-sonnet-4-5-20250929-v1:0` |
| `haiku` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| `claude-opus-4-20250514` | `us.anthropic.claude-opus-4-20250514-v1:0` |
| `claude-sonnet-4-5-20250929` | `global.anthropic.claude-sonnet-4-5-20250929-v1:0` |

### Proxy Features

- Full Anthropic Messages API compatibility
- Streaming responses (SSE)
- Tool/function calling support
- Image/multimodal support
- Automatic model mapping
- AWS credential chain support (env vars, profiles, SSO, IAM roles)
- Health check endpoint

---

## Alternative Approaches (For Reference)

### Traffic Interception with mitmproxy

You can intercept Claude Desktop's HTTPS traffic, but since it loads a web app, this would intercept traffic to `claude.ai` rather than direct API calls.

```bash
# Install mitmproxy CA cert first
python intercept_claude.py
```

### Electron App Patching

The `patch_claude_desktop.py` script can modify the Electron app, but this won't redirect API calls since Claude Desktop is a WebView to `claude.ai`.

---

## Project Files

| File | Description |
|------|-------------|
| `bedrock_chat.py` | Full Claude Desktop replacement with local storage |
| `chat_storage.py` | SQLite storage for conversations |
| `system_prompt.py` | Official Claude system prompts |
| `bedrock_proxy.py` | API proxy (Anthropic → Bedrock) |
| `intercept_claude.py` | mitmproxy traffic interceptor |
| `patch_claude_desktop.py` | Electron app patcher (limited use) |

---

## Troubleshooting

### "AccessDeniedException"
Make sure you have access to Claude models in Bedrock:
1. Go to AWS Console → Bedrock → Model access
2. Request access to Anthropic Claude models
3. Wait for approval (usually instant)

### "ThrottlingException"
You're hitting rate limits. Options:
- Wait and retry
- Request a quota increase in AWS
- Use inference profiles for cross-region routing

### Credentials not working
```bash
# Verify your credentials
aws sts get-caller-identity

# Check Bedrock access
aws bedrock list-foundation-models --query "modelSummaries[?contains(modelId, 'claude')]"
```

---

## License

MIT - Do whatever you want with it!
