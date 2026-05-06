import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";
import type { ChatCompletionTool } from "openai/resources/chat/completions/completions";
import type { UserMcpServer } from "../repositories/user.repository.js";

const TOOL_NAME_SEPARATOR = "__";

const LIST_TOOLS_TIMEOUT_MS = 30_000;
const CALL_TOOL_TIMEOUT_MS = 60_000;

type ConnectedSession = {
  serverId: string;
  entry: UserMcpServer;
  client: Client;
  transport: { close: () => Promise<void> };
};

type HttpRestTool = {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    [key: string]: unknown;
  };
};

export type McpToolBundle = {
  openAiTools: ChatCompletionTool[];
  callPrefixedTool: (prefixedName: string, argumentsJson: string) => Promise<string>;
  close: () => Promise<void>;
};

export type McpServerTestResult = {
  ok: boolean;
  toolCount: number;
  toolNames: string[];
};

function mergeProcessEnv(override?: Record<string, string>): Record<string, string> | undefined {
  if (!override || Object.keys(override).length === 0) {
    return undefined;
  }
  return { ...process.env, ...override } as Record<string, string>;
}

function buildTransport(server: UserMcpServer): StdioClientTransport | StreamableHTTPClientTransport {
  if (server.transport === "http") {
    return new StreamableHTTPClientTransport(new URL(server.url ?? ""), {
      requestInit: {
        headers: server.headers ?? {}
      }
    });
  }
  return new StdioClientTransport({
    command: server.command ?? "",
    args: server.args,
    env: mergeProcessEnv(server.env),
    cwd: server.cwd,
    stderr: "inherit"
  });
}

function buildHttpHeaders(server: UserMcpServer): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(server.headers ?? {})
  };
}

async function listHttpRestTools(server: UserMcpServer): Promise<HttpRestTool[]> {
  const response = await fetch(server.url ?? "", {
    method: "GET",
    headers: buildHttpHeaders(server)
  });
  if (!response.ok) {
    throw new Error(`Falha ao carregar catálogo HTTP tools (${response.status}).`);
  }
  const payload = (await response.json()) as {
    tools?: Array<{
      name: string;
      description?: string;
      input_schema?: Record<string, unknown>;
    }>;
  };
  return (payload.tools ?? []).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: "object",
      ...(tool.input_schema ?? {})
    } as HttpRestTool["inputSchema"]
  }));
}

async function callHttpRestTool(server: UserMcpServer, toolName: string, args: Record<string, unknown>): Promise<string> {
  const base = (server.url ?? "").replace(/\/+$/, "");
  const response = await fetch(`${base}/${encodeURIComponent(toolName)}`, {
    method: "POST",
    headers: buildHttpHeaders(server),
    body: JSON.stringify(args)
  });
  const text = await response.text();
  if (!response.ok) {
    return `Erro da ferramenta HTTP (${response.status}): ${text}`;
  }
  if (!text.trim()) {
    return "(sem conteúdo)";
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return JSON.stringify(parsed);
  } catch {
    return text;
  }
}

function formatCallToolResult(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const chunks: string[] = [];
  const blocks = Array.isArray(result.content) ? result.content : [];
  for (const item of blocks) {
    if (item.type === "text") {
      chunks.push(item.text);
    } else {
      chunks.push(`[${item.type}]`);
    }
  }
  const body = chunks.join("\n").trim();
  if (result.isError) {
    return body.length > 0 ? `Erro da ferramenta: ${body}` : "Erro da ferramenta MCP.";
  }
  return body.length > 0 ? body : "(sem conteúdo)";
}

async function listAllTools(client: Client): Promise<
  {
    name: string;
    description?: string;
    inputSchema: {
      type: "object";
      [key: string]: unknown;
    };
  }[]
> {
  const tools: {
    name: string;
    description?: string;
    inputSchema: {
      type: "object";
      [key: string]: unknown;
    };
  }[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : {}, {
      timeout: LIST_TOOLS_TIMEOUT_MS
    });
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  return tools;
}

export class McpClientService {
  /**
   * Conecta aos servidores stdio permitidos, agrega tools com nome prefixado `serverId__toolName`
   * e retorna um bundle que deve ser fechado após o uso (fecha processos filhos).
   */
  async createToolBundle(allowedServerIds: string[], catalog: UserMcpServer[]): Promise<McpToolBundle | null> {
    if (catalog.length === 0 || allowedServerIds.length === 0) {
      return null;
    }

    const idSet = new Set(allowedServerIds);
    const sessions: ConnectedSession[] = [];
    const prefixMap = new Map<
      string,
      | { kind: "mcp"; client: Client; toolName: string }
      | { kind: "http-rest"; server: UserMcpServer; toolName: string }
    >();
    const openAiTools: ChatCompletionTool[] = [];

    try {
      for (const entry of catalog) {
        if (!idSet.has(entry.id)) {
          continue;
        }
        if (entry.transport === "http") {
          const tools = await listHttpRestTools(entry);
          for (const tool of tools) {
            const prefixedName = `${entry.id}${TOOL_NAME_SEPARATOR}${tool.name}`;
            prefixMap.set(prefixedName, { kind: "http-rest", server: entry, toolName: tool.name });
            openAiTools.push({
              type: "function",
              function: {
                name: prefixedName,
                description:
                  tool.description && tool.description.trim().length > 0
                    ? tool.description
                    : `Ferramenta ${tool.name} (${entry.name})`,
                parameters: tool.inputSchema
              }
            });
          }
          continue;
        }

        const transport = buildTransport(entry);

        const client = new Client({ name: "whatsdelsuc", version: "1.0.0" });
        await client.connect(transport);

        sessions.push({ serverId: entry.id, entry, client, transport });

        const tools = await listAllTools(client);
        for (const tool of tools) {
          const prefixedName = `${entry.id}${TOOL_NAME_SEPARATOR}${tool.name}`;
          prefixMap.set(prefixedName, { kind: "mcp", client, toolName: tool.name });
          openAiTools.push({
            type: "function",
            function: {
              name: prefixedName,
              description:
                tool.description && tool.description.trim().length > 0
                  ? tool.description
                  : `Ferramenta ${tool.name} (${entry.name})`,
              parameters: tool.inputSchema
            }
          });
        }
      }
    } catch (error) {
      await this.closeSessions(sessions);
      throw error;
    }

    if (openAiTools.length === 0) {
      await this.closeSessions(sessions);
      return null;
    }

    const close = async (): Promise<void> => {
      await this.closeSessions(sessions);
    };

    const callPrefixedTool = async (prefixedName: string, argumentsJson: string): Promise<string> => {
      const target = prefixMap.get(prefixedName);
      if (!target) {
        return `Ferramenta MCP desconhecida: ${prefixedName}`;
      }
      let args: Record<string, unknown> = {};
      const trimmed = argumentsJson?.trim() ?? "";
      if (trimmed.length > 0) {
        try {
          const parsed: unknown = JSON.parse(trimmed);
          args = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
        } catch {
          return "Argumentos da ferramenta não são JSON válido.";
        }
      }
      if (target.kind === "http-rest") {
        return callHttpRestTool(target.server, target.toolName, args);
      }
      const result = await target.client.callTool({ name: target.toolName, arguments: args }, undefined, {
        timeout: CALL_TOOL_TIMEOUT_MS
      });
      return formatCallToolResult(result);
    };

    return { openAiTools, callPrefixedTool, close };
  }

  async testServerConnection(server: UserMcpServer): Promise<McpServerTestResult> {
    if (server.transport === "http") {
      const tools = await listHttpRestTools(server);
      return {
        ok: true,
        toolCount: tools.length,
        toolNames: tools.map((tool) => tool.name)
      };
    }

    const sessions: ConnectedSession[] = [];
    try {
      const transport = buildTransport(server);
      const client = new Client({ name: "whatsdelsuc", version: "1.0.0" });
      await client.connect(transport);
      sessions.push({ serverId: server.id, entry: server, client, transport });

      const tools = await listAllTools(client);
      return {
        ok: true,
        toolCount: tools.length,
        toolNames: tools.map((tool) => tool.name)
      };
    } finally {
      await this.closeSessions(sessions);
    }
  }

  private async closeSessions(sessions: ConnectedSession[]): Promise<void> {
    await Promise.all(
      sessions.map(async (session) => {
        try {
          await session.transport.close();
        } catch {
          // ignore close errors
        }
      })
    );
  }
}
