import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type Message as BedrockMessage,
  type ContentBlock
} from '@aws-sdk/client-bedrock-runtime'
import { fromIni } from '@aws-sdk/credential-providers'
import { BrowserWindow } from 'electron'
import { getSetting } from './database'

// Model ID mapping
const MODEL_MAP: Record<string, string> = {
  opus: 'us.anthropic.claude-opus-4-20250514-v1:0',
  sonnet: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  haiku: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  'sonnet-3.5': 'us.anthropic.claude-3-5-sonnet-20241022-v2:0'
}

export function getModelId(model: string): string {
  return MODEL_MAP[model] || model
}

export function getBedrockClient(): BedrockRuntimeClient {
  const profile = getSetting('aws_profile') || undefined
  const region = getSetting('aws_region') || 'us-east-1'

  const config: { region: string; credentials?: ReturnType<typeof fromIni> } = {
    region
  }

  if (profile) {
    config.credentials = fromIni({ profile })
  }

  return new BedrockRuntimeClient(config)
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `The assistant is Claude, created by Anthropic.

Claude's knowledge base was last updated in early 2025. It answers questions about events prior to and after that time the way a highly informed individual from early 2025 would if they were talking to someone from the above date, and can let the user know this when relevant.

If asked about controversial topics, Claude provides careful thoughts and clear information. Claude presents the requested information without explicitly saying that the topic is sensitive, and without claiming to be presenting objective facts.

When presented with a math problem, logic problem, or other problem benefiting from systematic thinking, Claude thinks through it step by step before giving its final answer.

If Claude is asked about a very obscure person, object, or topic, i.e. if it is asked for the kind of information that is unlikely to be found more than once or twice on the internet, Claude ends its response by reminding the user that although it tries to be accurate, it may hallucinate in response to questions like this. It uses the term 'hallucinate' to describe this since the user will understand what it means.

If Claude mentions or cites particular articles, papers, or books, it always lets the user know that it doesn't have access to search or a database and may hallucinate citations, so the user should double check its citations.

Claude is intellectually curious. It enjoys hearing what humans think on an issue and engaging in discussion on a wide variety of topics.

Claude uses markdown for code.

Claude follows this information in all languages, and always responds to the user in the language they use or request. This information is provided to Claude by Anthropic. Claude never mentions this information unless it is directly pertinent to the query.`

export async function streamChat(
  window: BrowserWindow,
  conversationId: string,
  messages: ChatMessage[],
  model: string
): Promise<string> {
  const client = getBedrockClient()
  const modelId = getModelId(model)

  // Convert messages to Bedrock format
  const bedrockMessages: BedrockMessage[] = messages.map((msg) => ({
    role: msg.role,
    content: [{ text: msg.content }] as ContentBlock[]
  }))

  const command = new ConverseStreamCommand({
    modelId,
    messages: bedrockMessages,
    system: [{ text: SYSTEM_PROMPT }],
    inferenceConfig: {
      maxTokens: 8192,
      temperature: 0.7
    }
  })

  let fullResponse = ''

  try {
    const response = await client.send(command)

    if (response.stream) {
      for await (const event of response.stream) {
        if (event.contentBlockDelta?.delta?.text) {
          const token = event.contentBlockDelta.delta.text
          fullResponse += token
          window.webContents.send('stream:token', { conversationId, token })
        }

        if (event.messageStop) {
          window.webContents.send('stream:done', { conversationId })
        }
      }
    }

    return fullResponse
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    window.webContents.send('stream:error', { conversationId, error: errorMessage })
    throw error
  }
}

export async function listAwsProfiles(): Promise<string[]> {
  const { readFileSync, existsSync } = await import('fs')
  const { homedir } = await import('os')
  const { join } = await import('path')

  const profiles: string[] = []
  const configPath = join(homedir(), '.aws', 'config')

  if (existsSync(configPath)) {
    const content = readFileSync(configPath, 'utf-8')
    const matches = content.matchAll(/\[profile\s+([^\]]+)\]/g)
    for (const match of matches) {
      profiles.push(match[1])
    }
    // Check for default profile
    if (content.includes('[default]')) {
      profiles.unshift('default')
    }
  }

  return profiles
}

export async function testAwsConnection(profile: string, region: string): Promise<boolean> {
  try {
    const client = new BedrockRuntimeClient({
      region,
      credentials: profile ? fromIni({ profile }) : undefined
    })

    // Just try to create the client - actual test would require a model call
    // For now, we just verify credentials can be loaded
    await client.config.credentials()
    return true
  } catch {
    return false
  }
}
