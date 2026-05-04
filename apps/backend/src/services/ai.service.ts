import OpenAI from "openai";
import { env } from "../lib/env.js";

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
  }): Promise<string> {
    const apiKey = this.resolveApiKey(input.userOpenAiApiKey);
    if (!apiKey) {
      return "Desculpe, a chave da API OpenAI não está configurada. Use o menu Chave IA na lateral.";
    }

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.inboundMessageText }
      ]
    });

    return completion.choices[0]?.message?.content?.trim() || "Desculpe, não consegui responder agora.";
  }

  getModelName(): string {
    return MODEL_NAME;
  }
}
