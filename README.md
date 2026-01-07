# Claude on Bedrock

A **Claude Desktop replacement** that runs entirely on your AWS account. Chat with Claude Opus, Sonnet, or Haiku through AWS Bedrock with all conversations stored locally.

## Why This Exists

After reverse-engineering Claude Desktop, we found it's just a WebView wrapper that loads `claude.ai`. Your chats are stored on Anthropic's servers, and there's no way to redirect API calls to Bedrock.

So we built a complete replacement:
- **Local storage** - All chats in SQLite on your machine
- **Your AWS account** - Use Bedrock, pay AWS prices
- **Official system prompt** - Same Claude behavior as the real app
- **No Anthropic account needed**

---

## Installation

### Prerequisites

- **Python 3.10+**
- **AWS Account** with Bedrock access
- **AWS CLI** configured (optional but recommended)

### Step 1: Clone the Repository

```bash
git clone https://github.com/your-org/claude-desktop-connect.git
cd claude-desktop-connect
```

### Step 2: Create Virtual Environment (Recommended)

```bash
# Create venv
python -m venv venv

# Activate it
source venv/bin/activate      # Linux/macOS
# or
venv\Scripts\activate         # Windows
```

### Step 3: Install Dependencies

```bash
pip install -r requirements.txt
```

### Step 4: Enable Claude Models in AWS Bedrock

Before you can use Claude, you need to enable the models in your AWS account:

1. Go to [AWS Bedrock Console](https://console.aws.amazon.com/bedrock)
2. Click **Model access** in the left sidebar
3. Click **Manage model access**
4. Check the boxes for Claude models you want:
   - Anthropic Claude Opus 4
   - Anthropic Claude Sonnet 4.5
   - Anthropic Claude Haiku 4.5
5. Click **Save changes**
6. Wait for status to show "Access granted" (usually instant)

### Step 5: Configure AWS Credentials

Choose one of these methods:

**Option A: AWS SSO (Recommended)**
```bash
# Configure SSO
aws configure sso

# Login
aws sso login --profile your-profile

# Set environment
export AWS_PROFILE=your-profile
export AWS_REGION=us-east-1
```

**Option B: Environment Variables**
```bash
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_REGION=us-east-1
```

**Option C: AWS Credentials File**
```bash
# ~/.aws/credentials
[default]
aws_access_key_id = AKIA...
aws_secret_access_key = your-secret-key

# Then just set region
export AWS_REGION=us-east-1
```

### Step 6: Verify AWS Setup

```bash
# Check your identity
aws sts get-caller-identity

# Check Bedrock access
aws bedrock list-foundation-models --query "modelSummaries[?contains(modelId, 'claude')].modelId"
```

---

## Usage

### Quick Start (with run.sh)

The easiest way to launch - handles SSO login automatically:

```bash
# With a profile name
./run.sh your-profile

# Or set it in environment
AWS_PROFILE=your-profile ./run.sh

# Examples:
./run.sh dev-account
./run.sh prod-readonly
AWS_PROFILE=my-sso-profile ./run.sh
```

The script will:
1. Check if your credentials are valid
2. Prompt for SSO login if expired
3. Launch the chat UI

### Manual Launch

```bash
# Step 1: Login (if using SSO)
aws sso login --profile your-profile

# Step 2: Set environment
export AWS_PROFILE=your-profile
export AWS_REGION=us-east-1

# Step 3: Run
streamlit run bedrock_chat.py

# Or as a one-liner:
AWS_PROFILE=your-profile AWS_REGION=us-east-1 streamlit run bedrock_chat.py
```

Open http://localhost:8501 in your browser.

**Features:**
- Conversation sidebar with history
- Model selection (Opus, Sonnet, Haiku)
- Streaming responses
- Export/import conversations
- Temperature and max tokens controls
- Official Claude system prompt

**Data Location:** `~/.config/claude-bedrock/chats.db`

### API Proxy (For Other Tools)

Run a local server that translates Anthropic API calls to Bedrock:

```bash
# Terminal 1: Start the proxy
python bedrock_proxy.py

# Terminal 2: Use any Anthropic client
export ANTHROPIC_BASE_URL=http://localhost:8080
export ANTHROPIC_API_KEY=dummy

# Now use Claude Code, Python SDK, etc.
claude  # Claude Code works!
```

---

## Quick Reference

### Available Models

| Display Name | Model Key | Bedrock ID |
|-------------|-----------|------------|
| Claude Opus 4 | `opus` | `us.anthropic.claude-opus-4-20250514-v1:0` |
| Claude Sonnet 4.5 | `sonnet` | `global.anthropic.claude-sonnet-4-5-20250929-v1:0` |
| Claude Sonnet 4 | `sonnet` | `us.anthropic.claude-sonnet-4-20250514-v1:0` |
| Claude Haiku 4.5 | `haiku` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| Claude 3.5 Sonnet | `sonnet` | `us.anthropic.claude-3-5-sonnet-20241022-v2:0` |
| Claude 3.5 Haiku | `haiku` | `us.anthropic.claude-3-5-haiku-20241022-v1:0` |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_REGION` | `us-east-1` | AWS region for Bedrock |
| `AWS_PROFILE` | - | AWS profile name |
| `USE_SYSTEM_PROMPT` | `true` | Include official Claude system prompt |
| `PROXY_PORT` | `8080` | Port for the API proxy |

### Project Files

| File | Description |
|------|-------------|
| `run.sh` | Quick start script (handles SSO login) |
| `bedrock_chat.py` | Streamlit chat UI (main app) |
| `chat_storage.py` | SQLite conversation storage |
| `system_prompt.py` | Official Claude system prompts |
| `bedrock_proxy.py` | Anthropic API → Bedrock proxy |
| `requirements.txt` | Python dependencies |

---

## Examples

### Python SDK with Proxy

```python
from anthropic import Anthropic

client = Anthropic(
    base_url="http://localhost:8080",
    api_key="dummy"
)

response = client.messages.create(
    model="opus",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.content[0].text)
```

### Direct Bedrock (No Proxy)

```python
import boto3

client = boto3.client("bedrock-runtime", region_name="us-east-1")

response = client.converse(
    modelId="us.anthropic.claude-opus-4-20250514-v1:0",
    messages=[{"role": "user", "content": [{"text": "Hello!"}]}]
)
print(response["output"]["message"]["content"][0]["text"])
```

### curl

```bash
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "opus",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## Troubleshooting

### "AccessDeniedException"

You haven't enabled Claude models in Bedrock:
1. Go to AWS Console → Bedrock → Model access
2. Enable the Claude models you want to use
3. Wait for "Access granted" status

### "ExpiredTokenException"

Your AWS credentials have expired:
```bash
# For SSO
aws sso login --profile your-profile

# Then re-export
export AWS_PROFILE=your-profile
```

### "ThrottlingException"

You're hitting rate limits:
- Wait a moment and retry
- Request quota increase in AWS Service Quotas
- Use a different region

### Chat UI won't start

```bash
# Make sure you're in the right directory
cd claude-desktop-connect

# Make sure venv is activated
source venv/bin/activate

# Check streamlit is installed
pip install streamlit

# Try again
streamlit run bedrock_chat.py
```

### Can't find the database

Conversations are stored at:
- **Linux/macOS:** `~/.config/claude-bedrock/chats.db`
- **Windows:** `C:\Users\<you>\.config\claude-bedrock\chats.db`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude on Bedrock                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Streamlit   │    │   SQLite     │    │   System     │  │
│  │  Chat UI     │───▶│   Storage    │    │   Prompt     │  │
│  │              │    │              │    │              │  │
│  └──────┬───────┘    └──────────────┘    └──────────────┘  │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────┐                                           │
│  │   Bedrock    │──────────────────────────────────────┐    │
│  │   Client     │                                      │    │
│  └──────────────┘                                      │    │
│                                                        ▼    │
└────────────────────────────────────────────────────────┼────┘
                                                         │
                         ┌───────────────────────────────┘
                         ▼
              ┌─────────────────────┐
              │    AWS Bedrock      │
              │  (Claude Models)    │
              └─────────────────────┘
```

---

## License

MIT - Do whatever you want with it!

---

## Contributing

PRs welcome! Some ideas:
- Dark mode for chat UI
- Keyboard shortcuts
- Image/file upload support
- Conversation search
- Multiple chat windows
