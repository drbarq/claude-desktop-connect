import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type Message as BedrockMessage,
  type ContentBlock
} from '@aws-sdk/client-bedrock-runtime'
import { fromIni } from '@aws-sdk/credential-providers'
import { BrowserWindow } from 'electron'
import { getSetting } from './database'
import { TOOL_CONFIG, executeTool } from './tools'
import { homedir } from 'os'

// Model ID mapping
const MODEL_MAP: Record<string, string> = {
  'opus-4.5': 'global.anthropic.claude-opus-4-5-20251101-v1:0',
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
  content: string | ContentBlock[]
}

// Get current date formatted
function getCurrentDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

// Full system prompt with tool instructions
function getSystemPrompt(workingDir: string): string {
  const currentDate = getCurrentDate()

  return `You are Claude, an AI assistant created by Anthropic. You are running in a desktop application that gives you access to the user's computer through various tools.

Current date: ${currentDate}
Working directory: ${workingDir}

<tools_available>
You have access to the following tools to help the user:

1. **Read** - Read file contents. Returns content with line numbers.
2. **Write** - Write content to a file. Creates new or overwrites existing.
3. **Edit** - Edit a file by replacing exact text strings.
4. **Bash** - Execute bash commands (git, npm, system commands, etc.)
5. **Glob** - Find files matching a pattern (e.g., "**/*.ts")
6. **Grep** - Search file contents using regex patterns.
7. **LS** - List directory contents.
</tools_available>

<tool_usage_guidelines>
- Use tools proactively to help the user accomplish their goals
- Read files before editing them to understand context
- Use Glob and Grep to explore codebases before making changes
- Execute Bash commands for git operations, running tests, installing packages, etc.
- Always provide clear feedback about what tools you're using and why
- If a tool fails, explain the error and try an alternative approach
</tool_usage_guidelines>

<behavior>
- Be helpful, harmless, and honest
- Use natural prose without excessive formatting unless specifically requested
- When writing code, use markdown code blocks with language identifiers
- Be concise but thorough in explanations
- If you're unsure about something, say so
- For complex tasks, break them down into steps
</behavior>

<knowledge_cutoff>
Your knowledge cutoff is early 2025. For questions about events after this date, acknowledge that you may not have current information.
</knowledge_cutoff>`
}

// Convert internal messages to Bedrock format
function toBedrockMessages(messages: ChatMessage[]): BedrockMessage[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: typeof msg.content === 'string'
      ? [{ text: msg.content }] as ContentBlock[]
      : msg.content as ContentBlock[]
  }))
}

// Stream chat with tool support
export async function streamChat(
  window: BrowserWindow,
  conversationId: string,
  messages: ChatMessage[],
  model: string,
  workingDir?: string
): Promise<string> {
  const client = getBedrockClient()
  const modelId = getModelId(model)
  const cwd = workingDir || homedir()

  // Start with user's messages
  let conversationMessages = toBedrockMessages(messages)
  let fullResponse = ''
  let iterationCount = 0
  const maxIterations = 50 // Safety limit

  try {
    while (iterationCount < maxIterations) {
      iterationCount++

      // Make the API call with streaming
      const command = new ConverseStreamCommand({
        modelId,
        messages: conversationMessages,
        system: [{ text: getSystemPrompt(cwd) }],
        toolConfig: TOOL_CONFIG,
        inferenceConfig: {
          maxTokens: 8192,
          temperature: 0.7
        }
      })

      const response = await client.send(command)

      let currentText = ''
      let toolUseBlocks: Array<{ toolUseId: string; name: string; input: Record<string, unknown> }> = []
      let currentToolUse: { toolUseId: string; name: string; input: string } | null = null

      if (response.stream) {
        for await (const event of response.stream) {
          // Handle text content
          if (event.contentBlockDelta?.delta?.text) {
            const token = event.contentBlockDelta.delta.text
            currentText += token
            fullResponse += token
            window.webContents.send('stream:token', { conversationId, token })
          }

          // Handle tool use start
          if (event.contentBlockStart?.start?.toolUse) {
            const toolUse = event.contentBlockStart.start.toolUse
            currentToolUse = {
              toolUseId: toolUse.toolUseId || '',
              name: toolUse.name || '',
              input: ''
            }
            // Notify UI about tool use
            window.webContents.send('stream:toolUse', {
              conversationId,
              tool: currentToolUse.name,
              status: 'starting'
            })
          }

          // Handle tool use input delta
          if (event.contentBlockDelta?.delta?.toolUse) {
            if (currentToolUse) {
              currentToolUse.input += event.contentBlockDelta.delta.toolUse.input || ''
            }
          }

          // Handle content block stop (tool use complete)
          if (event.contentBlockStop && currentToolUse) {
            try {
              const input = JSON.parse(currentToolUse.input || '{}')
              toolUseBlocks.push({
                toolUseId: currentToolUse.toolUseId,
                name: currentToolUse.name,
                input
              })
            } catch {
              // If JSON parse fails, use empty object
              toolUseBlocks.push({
                toolUseId: currentToolUse.toolUseId,
                name: currentToolUse.name,
                input: {}
              })
            }
            currentToolUse = null
          }

          // Message complete
          if (event.messageStop) {
            // Check stop reason
            const stopReason = event.messageStop.stopReason

            if (stopReason === 'tool_use' && toolUseBlocks.length > 0) {
              // Build assistant message with tool uses
              const assistantContent: ContentBlock[] = []

              if (currentText) {
                assistantContent.push({ text: currentText })
              }

              for (const toolUse of toolUseBlocks) {
                assistantContent.push({
                  toolUse: {
                    toolUseId: toolUse.toolUseId,
                    name: toolUse.name,
                    input: toolUse.input as unknown as undefined
                  }
                })
              }

              // Add assistant message to conversation
              conversationMessages.push({
                role: 'assistant',
                content: assistantContent
              })

              // Execute tools and build tool results
              const toolResults: ContentBlock[] = []

              for (const toolUse of toolUseBlocks) {
                window.webContents.send('stream:toolUse', {
                  conversationId,
                  tool: toolUse.name,
                  status: 'executing',
                  input: toolUse.input
                })

                const result = await executeTool(toolUse.name, toolUse.input, cwd)

                window.webContents.send('stream:toolUse', {
                  conversationId,
                  tool: toolUse.name,
                  status: result.success ? 'completed' : 'failed',
                  result: result.result || result.error
                })

                // Stream tool result to user
                const toolResultText = result.success
                  ? `\n\n**[Tool: ${toolUse.name}]**\n${result.result}\n`
                  : `\n\n**[Tool: ${toolUse.name} - Error]**\n${result.error}\n`

                fullResponse += toolResultText
                window.webContents.send('stream:token', { conversationId, token: toolResultText })

                toolResults.push({
                  toolResult: {
                    toolUseId: toolUse.toolUseId,
                    content: [{ text: result.success ? result.result : `Error: ${result.error}` }],
                    status: result.success ? 'success' : 'error'
                  }
                } as ContentBlock)
              }

              // Add tool results as user message
              conversationMessages.push({
                role: 'user',
                content: toolResults
              })

              // Reset for next iteration
              currentText = ''
              toolUseBlocks = []

              // Continue the loop to get Claude's response to tool results
              continue
            } else {
              // No more tool use, we're done
              window.webContents.send('stream:done', { conversationId })
              return fullResponse
            }
          }
        }
      }
    }

    // If we hit max iterations
    window.webContents.send('stream:error', {
      conversationId,
      error: 'Maximum tool iterations reached'
    })
    return fullResponse
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    window.webContents.send('stream:error', { conversationId, error: errorMessage })
    throw error
  }
}

// Simple chat without tools (for backwards compatibility)
export async function streamChatSimple(
  window: BrowserWindow,
  conversationId: string,
  messages: ChatMessage[],
  model: string
): Promise<string> {
  const client = getBedrockClient()
  const modelId = getModelId(model)

  const bedrockMessages: BedrockMessage[] = messages.map((msg) => ({
    role: msg.role,
    content: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }] as ContentBlock[]
  }))

  const command = new ConverseStreamCommand({
    modelId,
    messages: bedrockMessages,
    system: [{ text: getSystemPrompt(homedir()) }],
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
