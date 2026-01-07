import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'
import { glob } from 'glob'
import type { ToolConfiguration } from '@aws-sdk/client-bedrock-runtime'

const execAsync = promisify(exec)

// Tool definitions for Bedrock Converse API
export const TOOL_CONFIG: ToolConfiguration = {
  tools: [
    {
      toolSpec: {
        name: 'Read',
        description: 'Read file contents. Supports text files, returns content with line numbers.',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Absolute path to the file to read'
              },
              offset: {
                type: 'number',
                description: 'Starting line number (1-indexed). Optional.'
              },
              limit: {
                type: 'number',
                description: 'Number of lines to read. Default 2000.'
              }
            },
            required: ['file_path']
          }
        }
      }
    },
    {
      toolSpec: {
        name: 'Write',
        description: 'Write content to a file. Creates new file or overwrites existing.',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Absolute path to the file to write'
              },
              content: {
                type: 'string',
                description: 'Content to write to the file'
              }
            },
            required: ['file_path', 'content']
          }
        }
      }
    },
    {
      toolSpec: {
        name: 'Edit',
        description: 'Edit a file by replacing exact text. Use for precise modifications.',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Absolute path to the file to edit'
              },
              old_string: {
                type: 'string',
                description: 'Exact text to find and replace'
              },
              new_string: {
                type: 'string',
                description: 'Replacement text'
              },
              replace_all: {
                type: 'boolean',
                description: 'Replace all occurrences. Default false.'
              }
            },
            required: ['file_path', 'old_string', 'new_string']
          }
        }
      }
    },
    {
      toolSpec: {
        name: 'Bash',
        description: 'Execute a bash command. Use for git, npm, system commands, etc.',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: 'The bash command to execute'
              },
              timeout: {
                type: 'number',
                description: 'Timeout in milliseconds. Default 120000 (2 min).'
              }
            },
            required: ['command']
          }
        }
      }
    },
    {
      toolSpec: {
        name: 'Glob',
        description: 'Find files matching a glob pattern. Returns file paths.',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: 'Glob pattern (e.g., "**/*.ts", "src/**/*.js")'
              },
              path: {
                type: 'string',
                description: 'Directory to search in. Defaults to current directory.'
              }
            },
            required: ['pattern']
          }
        }
      }
    },
    {
      toolSpec: {
        name: 'Grep',
        description: 'Search file contents using regex. Returns matching files or content.',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: 'Regex pattern to search for'
              },
              path: {
                type: 'string',
                description: 'File or directory to search. Defaults to current directory.'
              },
              include: {
                type: 'string',
                description: 'Glob pattern to filter files (e.g., "*.ts")'
              }
            },
            required: ['pattern']
          }
        }
      }
    },
    {
      toolSpec: {
        name: 'LS',
        description: 'List directory contents.',
        inputSchema: {
          json: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Directory path to list. Defaults to current directory.'
              }
            },
            required: []
          }
        }
      }
    }
  ]
}

// Tool executor functions
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  workingDir: string
): Promise<{ success: boolean; result: string; error?: string }> {
  try {
    switch (name) {
      case 'Read':
        return await executeRead(input as { file_path: string; offset?: number; limit?: number })

      case 'Write':
        return await executeWrite(input as { file_path: string; content: string })

      case 'Edit':
        return await executeEdit(
          input as { file_path: string; old_string: string; new_string: string; replace_all?: boolean }
        )

      case 'Bash':
        return await executeBash(
          input as { command: string; timeout?: number },
          workingDir
        )

      case 'Glob':
        return await executeGlob(
          input as { pattern: string; path?: string },
          workingDir
        )

      case 'Grep':
        return await executeGrep(
          input as { pattern: string; path?: string; include?: string },
          workingDir
        )

      case 'LS':
        return await executeLS(input as { path?: string }, workingDir)

      default:
        return { success: false, result: '', error: `Unknown tool: ${name}` }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, result: '', error: errorMessage }
  }
}

async function executeRead(input: {
  file_path: string
  offset?: number
  limit?: number
}): Promise<{ success: boolean; result: string; error?: string }> {
  const { file_path, offset = 1, limit = 2000 } = input

  try {
    const content = await fs.readFile(file_path, 'utf-8')
    const lines = content.split('\n')

    // Apply offset and limit
    const startLine = Math.max(0, offset - 1)
    const endLine = Math.min(lines.length, startLine + limit)
    const selectedLines = lines.slice(startLine, endLine)

    // Format with line numbers (like cat -n)
    const result = selectedLines
      .map((line, i) => {
        const lineNum = startLine + i + 1
        const truncatedLine = line.length > 2000 ? line.substring(0, 2000) + '...' : line
        return `${String(lineNum).padStart(6)}\t${truncatedLine}`
      })
      .join('\n')

    return { success: true, result }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, result: '', error: `Failed to read file: ${errorMessage}` }
  }
}

async function executeWrite(input: {
  file_path: string
  content: string
}): Promise<{ success: boolean; result: string; error?: string }> {
  const { file_path, content } = input

  try {
    // Create directory if it doesn't exist
    const dir = path.dirname(file_path)
    await fs.mkdir(dir, { recursive: true })

    await fs.writeFile(file_path, content, 'utf-8')

    return { success: true, result: `Successfully wrote ${content.length} bytes to ${file_path}` }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, result: '', error: `Failed to write file: ${errorMessage}` }
  }
}

async function executeEdit(input: {
  file_path: string
  old_string: string
  new_string: string
  replace_all?: boolean
}): Promise<{ success: boolean; result: string; error?: string }> {
  const { file_path, old_string, new_string, replace_all = false } = input

  try {
    const content = await fs.readFile(file_path, 'utf-8')

    // Check if old_string exists
    if (!content.includes(old_string)) {
      return {
        success: false,
        result: '',
        error: `String not found in file: "${old_string.substring(0, 100)}${old_string.length > 100 ? '...' : ''}"`
      }
    }

    // Check for uniqueness if not replace_all
    if (!replace_all) {
      const regex = new RegExp(escapeRegExp(old_string), 'g')
      const matches = content.match(regex)
      const count = matches ? matches.length : 0
      if (count > 1) {
        return {
          success: false,
          result: '',
          error: `String appears ${count} times. Use replace_all=true or provide more context.`
        }
      }
    }

    // Perform replacement
    const newContent = replace_all
      ? content.split(old_string).join(new_string)
      : content.replace(old_string, new_string)

    await fs.writeFile(file_path, newContent, 'utf-8')

    return { success: true, result: `Successfully edited ${file_path}` }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, result: '', error: `Failed to edit file: ${errorMessage}` }
  }
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function executeBash(
  input: { command: string; timeout?: number },
  workingDir: string
): Promise<{ success: boolean; result: string; error?: string }> {
  const { command, timeout = 120000 } = input

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workingDir,
      timeout,
      maxBuffer: 1024 * 1024 * 10 // 10MB
    })

    let result = ''
    if (stdout) result += stdout
    if (stderr) result += (result ? '\n' : '') + stderr

    // Truncate if too long
    if (result.length > 30000) {
      result = result.substring(0, 30000) + '\n... (output truncated)'
    }

    return { success: true, result: result || '(no output)' }
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; message?: string }
    let result = ''
    if (execError.stdout) result += execError.stdout
    if (execError.stderr) result += (result ? '\n' : '') + execError.stderr

    return {
      success: false,
      result: result || '',
      error: execError.message || 'Command failed'
    }
  }
}

async function executeGlob(
  input: { pattern: string; path?: string },
  workingDir: string
): Promise<{ success: boolean; result: string; error?: string }> {
  const { pattern, path: searchPath } = input
  const cwd = searchPath ? path.resolve(workingDir, searchPath) : workingDir

  try {
    const files = await glob(pattern, {
      cwd,
      absolute: true,
      nodir: true,
      ignore: ['**/node_modules/**', '**/.git/**']
    })

    // Sort by modification time (most recent first)
    const filesWithStats = await Promise.all(
      files.map(async (file) => {
        try {
          const stats = await fs.stat(file)
          return { file, mtime: stats.mtime.getTime() }
        } catch {
          return { file, mtime: 0 }
        }
      })
    )

    filesWithStats.sort((a, b) => b.mtime - a.mtime)
    const result = filesWithStats.map((f) => f.file).join('\n')

    return { success: true, result: result || '(no files found)' }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, result: '', error: `Glob failed: ${errorMessage}` }
  }
}

async function executeGrep(
  input: { pattern: string; path?: string; include?: string },
  workingDir: string
): Promise<{ success: boolean; result: string; error?: string }> {
  const { pattern, path: searchPath, include } = input
  const cwd = searchPath ? path.resolve(workingDir, searchPath) : workingDir

  try {
    // Use ripgrep if available, fallback to grep
    const escapedPattern = pattern.replace(/"/g, '\\"')
    let command = `rg --no-heading --line-number "${escapedPattern}"`

    if (include) {
      command += ` --glob "${include}"`
    }

    command += ' --max-count 100' // Limit results

    const { stdout } = await execAsync(command, {
      cwd,
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 5
    })

    return { success: true, result: stdout || '(no matches found)' }
  } catch (error: unknown) {
    // rg returns exit code 1 when no matches found
    const execError = error as { code?: number; stdout?: string; message?: string }
    if (execError.code === 1 && !execError.stdout) {
      return { success: true, result: '(no matches found)' }
    }

    // Try fallback to grep
    try {
      const escapedPattern = pattern.replace(/"/g, '\\"')
      let command = `grep -rn "${escapedPattern}"`
      if (include) {
        command += ` --include="${include}"`
      }
      command += ' .'

      const { stdout } = await execAsync(command, {
        cwd,
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 5
      })

      return { success: true, result: stdout || '(no matches found)' }
    } catch {
      return { success: true, result: '(no matches found)' }
    }
  }
}

async function executeLS(
  input: { path?: string },
  workingDir: string
): Promise<{ success: boolean; result: string; error?: string }> {
  const targetPath = input.path ? path.resolve(workingDir, input.path) : workingDir

  try {
    const entries = await fs.readdir(targetPath, { withFileTypes: true })

    const result = entries
      .map((entry) => {
        const prefix = entry.isDirectory() ? 'd ' : '- '
        return prefix + entry.name
      })
      .sort()
      .join('\n')

    return { success: true, result: result || '(empty directory)' }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, result: '', error: `Failed to list directory: ${errorMessage}` }
  }
}
