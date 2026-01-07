# Bedrock Anthropic Proxy

Use **Claude Desktop** (or any Anthropic client) with **AWS Bedrock**. Run Opus on your own AWS account!

## The Problem

Claude Desktop is hardcoded to `api.anthropic.com`. There's no config to change it. But Bedrock already speaks Anthropic's message format - it just uses different endpoints with AWS auth.

## The Solution

Three approaches to redirect Claude Desktop → Bedrock:

```
┌──────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Claude Desktop  │────▶│  Bedrock Proxy  │────▶│   AWS Bedrock   │
│  (patched/proxy) │     │  (localhost)    │     │  (Claude Opus)  │
└──────────────────┘     └─────────────────┘     └─────────────────┘
```

### Approach 1: Patch the Electron App (Recommended)
Permanently modify Claude Desktop to hit your local proxy instead of api.anthropic.com.

### Approach 2: Traffic Interception with mitmproxy
Intercept HTTPS traffic without modifying the app.

### Approach 3: Use Alternative Chat UIs
Skip Claude Desktop entirely - use Open WebUI, the included Streamlit chat, etc.

---

## Quick Start (Approach 1 - Patch)

### Step 1: Install dependencies

```bash
pip install -r requirements.txt
npm install -g @electron/asar  # For patching the Electron app
```

### Step 2: Configure AWS credentials

```bash
# Option A: Environment variables
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_REGION=us-east-1

# Option B: AWS SSO (recommended)
aws sso login --profile your-profile
export AWS_PROFILE=your-profile
export AWS_REGION=us-east-1
```

### Step 3: Patch Claude Desktop

```bash
# Close Claude Desktop first!
python patch_claude_desktop.py

# This will:
# - Backup the original app
# - Replace api.anthropic.com with localhost:8080
# - Disable auto-updates (so the patch persists)
```

### Step 4: Run the proxy and launch Claude Desktop

```bash
# Terminal 1: Run the Bedrock proxy
python bedrock_proxy.py

# Terminal 2: Launch Claude Desktop normally
# It now talks to your proxy!
```

### Restore Original

```bash
python patch_claude_desktop.py --restore
```

---

## Approach 2: Traffic Interception (No App Modification)

If you don't want to modify Claude Desktop, intercept its traffic instead:

### Step 1: Install mitmproxy

```bash
pip install mitmproxy
```

### Step 2: Install mitmproxy's CA certificate

```bash
# First, run mitmproxy once to generate certs
mitmproxy  # Then press 'q' to quit

# macOS
sudo security add-trusted-cert -d -r trustRoot \
    -k /Library/Keychains/System.keychain \
    ~/.mitmproxy/mitmproxy-ca-cert.pem

# Windows (as Administrator)
certutil -addstore root %USERPROFILE%\.mitmproxy\mitmproxy-ca-cert.cer

# Linux
sudo cp ~/.mitmproxy/mitmproxy-ca-cert.pem \
    /usr/local/share/ca-certificates/mitmproxy.crt
sudo update-ca-certificates
```

### Step 3: Run the interceptor and proxy

```bash
# Terminal 1: Bedrock proxy
python bedrock_proxy.py

# Terminal 2: Traffic interceptor
python intercept_claude.py

# Terminal 3: Launch Claude Desktop with proxy
HTTPS_PROXY=http://localhost:8888 /Applications/Claude.app/Contents/MacOS/Claude
```

---

## Approach 3: Alternative Chat UI

Don't want to mess with Claude Desktop? Use the included Streamlit chat:

```bash
streamlit run bedrock_chat.py
```

Or connect Open WebUI to the Bedrock proxy (see main README section below).

---

## Direct Proxy Usage

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure AWS credentials

```bash
# Option A: Environment variables
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_REGION=us-east-1

# Option B: AWS SSO (recommended)
aws sso login --profile your-profile
export AWS_PROFILE=your-profile
export AWS_REGION=us-east-1
```

### 3. Run the proxy

```bash
python bedrock_proxy.py
```

### 4. Point your client at it

```bash
export ANTHROPIC_BASE_URL=http://localhost:8080
export ANTHROPIC_API_KEY=dummy  # Required by some clients but not used

# Now use any Anthropic-compatible tool!
```

## Usage Examples

### With the Anthropic Python SDK

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

### With Claude Code

```bash
# Terminal 1: Run the Bedrock proxy
python bedrock_proxy.py

# Terminal 2: Configure Claude Code
export ANTHROPIC_BASE_URL=http://localhost:8080
export ANTHROPIC_API_KEY=dummy
claude
```

### With curl

```bash
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "opus",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Model Mapping

The proxy automatically maps friendly model names to Bedrock inference profile IDs:

| Model Name | Bedrock ID |
|------------|------------|
| `opus` | `us.anthropic.claude-opus-4-20250514-v1:0` |
| `sonnet` | `global.anthropic.claude-sonnet-4-5-20250929-v1:0` |
| `haiku` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| `claude-opus-4-20250514` | `us.anthropic.claude-opus-4-20250514-v1:0` |
| `claude-sonnet-4-5-20250929` | `global.anthropic.claude-sonnet-4-5-20250929-v1:0` |

You can also use Bedrock IDs directly:
```bash
curl -X POST http://localhost:8080/v1/messages \
  -d '{"model": "us.anthropic.claude-opus-4-20250514-v1:0", ...}'
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `AWS_REGION` | `us-east-1` | AWS region for Bedrock |
| `BEDROCK_MODEL` | `us.anthropic.claude-opus-4-20250514-v1:0` | Default model |
| `PROXY_PORT` | `8080` | Port to run the proxy on |
| `LOG_LEVEL` | `INFO` | Logging level |

## Features

- Full Anthropic Messages API compatibility
- Streaming responses (SSE)
- Tool/function calling support
- Image/multimodal support
- Automatic model mapping
- AWS credential chain support (env vars, profiles, SSO, IAM roles)
- Health check endpoint
- Detailed logging

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
- Use inference profiles for cross-region routing (already configured for Sonnet 4.5)

### "ValidationException"
The request format might not match what Bedrock expects. Check:
- Message format (role should be "user" or "assistant")
- Content format (string or array of content blocks)

### Credentials not working
```bash
# Verify your credentials
aws sts get-caller-identity

# Check Bedrock access
aws bedrock list-foundation-models --query "modelSummaries[?contains(modelId, 'claude')]"
```

## Architecture

The proxy uses:
- **FastAPI** for the HTTP server
- **boto3** for AWS Bedrock communication
- **Bedrock Converse API** for model inference (supports streaming)

It handles translation between:
- Anthropic's `messages` endpoint format
- Bedrock's `converse` and `converse_stream` APIs

## License

MIT - Do whatever you want with it!
