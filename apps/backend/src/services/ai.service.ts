import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions/completions";
import { env } from "../lib/env.js";
import type { UserMcpServer } from "../repositories/user.repository.js";
import { McpClientService, type McpToolBundle } from "./mcp-client.service.js";

const MODEL_NAME = "gpt-4o-mini";

export class AIService {
  resolveApiKey(userApiKey?: string | null): string | undefined {
    const trimmed = userApiKey?.trim();
    if (trimmed) {
      return trimmed;
    }
    return env.OPENAI_API_KEY;
  }

  async generateReply(input: {
    userOpenAiApiKey?: string | null;
    systemPrompt: string;
    inboundMessageText: string;
    mcp?: {
      enabled: boolean;
      allowedServerIds: string[];
      maxSteps: number;
      servers: UserMcpServer[];
    };
  }): Promise<string> {
    const apiKey = this.resolveApiKey(input.userOpenAiApiKey);
    if (!apiKey) {
      return "Desculpe, a chave da API OpenAI não está configurada. Use o menu Chave IA na lateral.";
    }

    const client = new OpenAI({ apiKey });
    const mcp = input.mcp;

    if (mcp?.enabled && mcp.allowedServerIds.length > 0 && mcp.servers.length > 0) {
      const mcpService = new McpClientService();
      let bundle: McpToolBundle | null = null;
      try {
        bundle = await mcpService.createToolBundle(mcp.allowedServerIds, mcp.servers);
      } catch {
        bundle = null;
      }

      if (bundle) {
        try {
          return await this.runWithMcpTools(client, input.systemPrompt, input.inboundMessageText, bundle, mcp.maxSteps);
        } catch {
          return this.simpleChatCompletion(client, input.systemPrompt, input.inboundMessageText);
        } finally {
          await bundle.close();
        }
      }
    }

    return this.simpleChatCompletion(client, input.systemPrompt, input.inboundMessageText);
  }

  private async simpleChatCompletion(
    client: OpenAI,
    systemPrompt: string,
    inboundMessageText: string
  ): Promise<string> {
    const completion = await client.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: inboundMessageText }
      ]
    });

    return completion.choices[0]?.message?.content?.trim() || "Desculpe, não consegui responder agora.";
  }

  private async runWithMcpTools(
    client: OpenAI,
    systemPrompt: string,
    inboundMessageText: string,
    bundle: McpToolBundle,
    maxSteps: number
  ): Promise<string> {
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: inboundMessageText }
    ];

    const maxRounds = Math.max(1, Math.min(maxSteps, 20));

    for (let round = 0; round < maxRounds; round += 1) {
      const completion = await client.chat.completions.create({
        model: MODEL_NAME,
        messages,
        tools: bundle.openAiTools,
        tool_choice: "auto"
      });

      const choice = completion.choices[0];
      const message = choice?.message;
      if (!message) {
        break;
      }

      const toolCalls = message.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        messages.push(message);
        for (const call of toolCalls) {
          if (call.type !== "function") {
            continue;
          }
          const fn = call.function;
          let content: string;
          try {
            content = await bundle.callPrefixedTool(fn.name, fn.arguments ?? "{}");
          } catch (error) {
            content = `Erro ao executar ferramenta: ${error instanceof Error ? error.message : String(error)}`;
          }
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content
          });
        }
        continue;
      }

      const text = message.content?.trim();
      if (text) {
        return text;
      }
      if (choice?.finish_reason === "length") {
        return "Desculpe, a resposta ficou muito longa. Tente de novo com uma pergunta mais curta.";
      }
      break;
    }

    return "Desculpe, não consegui concluir a resposta com as ferramentas disponíveis.";
  }

  getModelName(): string {
    return MODEL_NAME;
  }
}
