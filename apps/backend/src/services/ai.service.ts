import OpenAI from "openai";
import { env } from "../lib/env.js";

const MODEL_NAME = "gpt-4o-mini";

export class AIService {
  private readonly client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY
    });
  }

  async generateReply(systemPrompt: string, inboundMessageText: string): Promise<string> {
    // Concatenate the user's prompt as system message + customer text as user message.
    const completion = await this.client.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: inboundMessageText }
      ]
    });

    return completion.choices[0]?.message?.content?.trim() || "Desculpe, não consegui responder agora.";
  }

  getModelName(): string {
    return MODEL_NAME;
  }
}
