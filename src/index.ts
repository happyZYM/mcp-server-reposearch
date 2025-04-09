#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { searchFiles } from './searchEngine.js';
import { SearchToolArgs } from './types.js';

class RepoSearchServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-server-reposearch',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search',
          description: 'Search for text content in files within a directory, provide more features than builtin `search_files` tool. CAREFULLY set the arguments to avoid introducing too much content. You should use this tool if you need to search the content of file in a repo.',
          inputSchema: {
            type: 'object',
            properties: {
              directory: {
                type: 'string',
                description: 'Directory to search in (use absolute path)',
              },
              query: {
                type: 'string',
                description: 'Search query (keyword or regex)',
              },
              isRegex: {
                type: 'boolean',
                description: 'Whether to treat query as regex pattern',
                default: false,
              },
              caseSensitive: {
                type: 'boolean',
                description: 'Whether to match case sensitively',
                default: false,
              },
              wholeWord: {
                type: 'boolean',
                description: 'Whether to match whole words only',
                default: false,
              },
              includeContent: {
                type: 'boolean',
                description: 'Whether to include matching line content in results. When you don\'t need the detailed content, you MUST disable it to save tokens. When you don\'t need the detailed content, you MUST disable it to save tokens. When you don\'t need the detailed content, you MUST disable it to save tokens.',
                default: true,
              },
              maxOutputBytes: {
                type: 'number',
                description: 'Maximum allowed output size in bytes. Default is 4096. Set to -1 for unlimited output.',
                default: 4096,
              }
            },
            required: ['directory', 'query'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'search') {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }

      const args = request.params.arguments;
      if (!args || typeof args !== 'object') {
        throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments');
      }

      if (!('directory' in args) || typeof args.directory !== 'string') {
        throw new McpError(ErrorCode.InvalidParams, 'Directory must be a string');
      }

      if (!('query' in args) || typeof args.query !== 'string') {
        throw new McpError(ErrorCode.InvalidParams, 'Query must be a string');
      }

      const searchArgs: SearchToolArgs = {
        directory: args.directory,
        query: args.query,
        isRegex: typeof args.isRegex === 'boolean' ? args.isRegex : false,
        caseSensitive: typeof args.caseSensitive === 'boolean' ? args.caseSensitive : false,
        wholeWord: typeof args.wholeWord === 'boolean' ? args.wholeWord : false,
        includeContent: typeof args.includeContent === 'boolean' ? args.includeContent : true,
        maxOutputBytes: typeof args.maxOutputBytes === 'number' ? args.maxOutputBytes : 4096,
      };

      const { directory, query, isRegex, caseSensitive, wholeWord, includeContent, maxOutputBytes } = searchArgs;

      try {
        const { results, summary } = await searchFiles(directory, {
          query,
          isRegex,
          caseSensitive,
          wholeWord,
          includeContent,
          maxOutputBytes,
        });

        if (summary.limitExceeded) {
          return {
            content: [
              {
                type: 'text',
                text: `Output size limit exceeded. Found ${summary.matchCount} matches with a total size of ${summary.totalBytes} bytes, which exceeds the limit of ${maxOutputBytes} bytes. Try narrowing your search or increasing the maxOutputBytes limit.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                results,
                summary: {
                  matchCount: summary.matchCount,
                  totalBytes: summary.totalBytes
                }
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Search error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('RepoSearch MCP server running on stdio');
  }
}

const server = new RepoSearchServer();
server.run().catch(console.error);
