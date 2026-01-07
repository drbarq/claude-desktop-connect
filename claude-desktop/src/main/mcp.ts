import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import * as fs from 'fs/promises'
import * as path from 'path'
import { app } from 'electron'

// MCP Server configuration (same format as Claude Desktop for compatibility)
export interface MCPServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>
}

// Tool definition from MCP server
export interface MCPTool {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
}

// Connected MCP server instance
interface MCPConnection {
  name: string
  client: Client
  transport: StdioClientTransport
  tools: MCPTool[]
}

class MCPManager {
  private connections: Map<string, MCPConnection> = new Map()
  private configPath: string

  constructor() {
    // Store config in app's user data directory
    const userDataPath = app?.getPath?.('userData') || process.cwd()
    this.configPath = path.join(userDataPath, 'mcp_config.json')
  }

  // Get the config file path (for UI to show/edit)
  getConfigPath(): string {
    return this.configPath
  }

  // Load MCP config from file
  async loadConfig(): Promise<MCPConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      // Return empty config if file doesn't exist
      return { mcpServers: {} }
    }
  }

  // Save MCP config to file
  async saveConfig(config: MCPConfig): Promise<void> {
    const dir = path.dirname(this.configPath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2))
  }

  // Create default config file if it doesn't exist
  async ensureConfigExists(): Promise<void> {
    try {
      await fs.access(this.configPath)
    } catch {
      // Create example config
      const exampleConfig: MCPConfig = {
        mcpServers: {
          // Example - users can add their own servers here
          // "filesystem": {
          //   "command": "npx",
          //   "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/directory"]
          // }
        }
      }
      await this.saveConfig(exampleConfig)
      console.log(`Created MCP config at: ${this.configPath}`)
    }
  }

  // Connect to a single MCP server
  async connectToServer(name: string, config: MCPServerConfig): Promise<MCPConnection | null> {
    try {
      console.log(`Connecting to MCP server: ${name}`)

      // Create the transport (spawns the server process)
      // Filter out undefined values from process.env
      const envVars: Record<string, string> = {}
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          envVars[key] = value
        }
      }

      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: { ...envVars, ...config.env }
      })

      // Create the client
      const client = new Client({
        name: 'claude-desktop-bedrock',
        version: '1.0.0'
      }, {
        capabilities: {}
      })

      // Connect
      await client.connect(transport)

      // Get available tools
      const toolsResult = await client.listTools()
      const tools: MCPTool[] = (toolsResult.tools || []).map((tool: any) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema || { type: 'object' }
      }))

      console.log(`Connected to ${name}, found ${tools.length} tools:`, tools.map(t => t.name))

      const connection: MCPConnection = {
        name,
        client,
        transport,
        tools
      }

      this.connections.set(name, connection)
      return connection
    } catch (error) {
      console.error(`Failed to connect to MCP server ${name}:`, error)
      return null
    }
  }

  // Connect to all configured MCP servers
  async connectAll(): Promise<void> {
    await this.ensureConfigExists()
    const config = await this.loadConfig()

    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      await this.connectToServer(name, serverConfig)
    }
  }

  // Disconnect from all servers
  async disconnectAll(): Promise<void> {
    for (const [name, connection] of this.connections) {
      try {
        await connection.client.close()
        console.log(`Disconnected from MCP server: ${name}`)
      } catch (error) {
        console.error(`Error disconnecting from ${name}:`, error)
      }
    }
    this.connections.clear()
  }

  // Get all tools from all connected servers (with server prefix)
  getAllTools(): Array<{ serverName: string; tool: MCPTool }> {
    const allTools: Array<{ serverName: string; tool: MCPTool }> = []

    for (const [serverName, connection] of this.connections) {
      for (const tool of connection.tools) {
        allTools.push({ serverName, tool })
      }
    }

    return allTools
  }

  // Convert MCP tools to Bedrock tool format
  getBedrockToolDefinitions(): Array<{ toolSpec: any }> {
    return this.getAllTools().map(({ serverName, tool }) => ({
      toolSpec: {
        name: `mcp_${serverName}_${tool.name}`,
        description: `[MCP: ${serverName}] ${tool.description || tool.name}`,
        inputSchema: {
          json: tool.inputSchema
        }
      }
    }))
  }

  // Check if a tool name is an MCP tool
  isMCPTool(toolName: string): boolean {
    return toolName.startsWith('mcp_')
  }

  // Parse MCP tool name to get server and tool
  parseMCPToolName(toolName: string): { serverName: string; toolName: string } | null {
    if (!toolName.startsWith('mcp_')) return null

    const parts = toolName.substring(4).split('_')
    if (parts.length < 2) return null

    const serverName = parts[0]
    const actualToolName = parts.slice(1).join('_')

    return { serverName, toolName: actualToolName }
  }

  // Call an MCP tool
  async callTool(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<{ success: boolean; result: string; error?: string }> {
    const parsed = this.parseMCPToolName(toolName)
    if (!parsed) {
      return { success: false, result: '', error: `Invalid MCP tool name: ${toolName}` }
    }

    const connection = this.connections.get(parsed.serverName)
    if (!connection) {
      return { success: false, result: '', error: `MCP server not connected: ${parsed.serverName}` }
    }

    try {
      const result = await connection.client.callTool({
        name: parsed.toolName,
        arguments: input
      })

      // Extract text content from result
      let resultText = ''
      if (result.content && Array.isArray(result.content)) {
        for (const item of result.content) {
          if (item.type === 'text') {
            resultText += item.text
          } else if (item.type === 'resource') {
            resultText += `[Resource: ${item.resource?.uri}]`
          }
        }
      }

      return {
        success: !result.isError,
        result: resultText || JSON.stringify(result),
        error: result.isError ? resultText : undefined
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, result: '', error: errorMessage }
    }
  }

  // Get list of connected servers
  getConnectedServers(): string[] {
    return Array.from(this.connections.keys())
  }

  // Get status of all servers
  getStatus(): Array<{ name: string; connected: boolean; toolCount: number }> {
    const status: Array<{ name: string; connected: boolean; toolCount: number }> = []

    for (const [name, connection] of this.connections) {
      status.push({
        name,
        connected: true,
        toolCount: connection.tools.length
      })
    }

    return status
  }
}

// Singleton instance
export const mcpManager = new MCPManager()
