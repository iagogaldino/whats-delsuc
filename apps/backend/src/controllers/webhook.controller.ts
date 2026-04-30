import type { FastifyReply, FastifyRequest } from "fastify";
import { AIService } from "../services/ai.service.js";
import { WhatsappService } from "../services/whatsapp.service.js";
import { InstanceRepository } from "../repositories/instance.repository.js";
import { ChatLogRepository } from "../repositories/chat-log.repository.js";

type WhatsAppWebhookBody = {
  event?: string;
  instanceId?: string;
  data?: {
    direction?: "inbound" | "outbound";
    from?: string;
    body?: string;
  };
};

const aiService = new AIService();
const whatsappService = new WhatsappService();
const instanceRepository = new InstanceRepository();
const chatLogRepository = new ChatLogRepository();

export async function whatsappWebhookController(
  request: FastifyRequest<{ Body: WhatsAppWebhookBody }>,
  reply: FastifyReply
): Promise<void> {
  const payload = request.body;
  const isInbound = payload?.event === "on-message" && payload?.data?.direction === "inbound";

  if (!isInbound) {
    return reply.status(202).send({ ignored: true });
  }

  const instanceId = payload.instanceId;
  const customerNumber = payload.data?.from;
  const inboundMessageText = payload.data?.body?.trim();

  if (!instanceId || !customerNumber || !inboundMessageText) {
    return reply.status(400).send({ error: "Invalid webhook payload" });
  }

  const instance = await instanceRepository.findByInstanceIdGlobal(instanceId);
  if (!instance) {
    return reply.status(404).send({ error: "Instance not found" });
  }

  await chatLogRepository.create({
    whatsappInstanceId: instance.id,
    customerNumber,
    direction: "INBOUND",
    message: inboundMessageText
  });

  if (!instance.autoReplyEnabled) {
    return reply.status(202).send({ ignored: true, reason: "auto-reply-disabled" });
  }

  let outboundMessage = "";
  let modelUsed: string | undefined;

  if (instance.autoReplyMode === "fixed") {
    outboundMessage = instance.fixedReplyMessage.trim();
    if (!outboundMessage) {
      return reply.status(202).send({ ignored: true, reason: "fixed-message-empty" });
    }
  } else {
    outboundMessage = await aiService.generateReply(instance.systemPrompt, inboundMessageText);
    modelUsed = aiService.getModelName();
  }

  await whatsappService.sendText({
    instanceId: instance.instanceId,
    token: instance.token,
    number: customerNumber,
    text: outboundMessage
  });

  await chatLogRepository.create({
    whatsappInstanceId: instance.id,
    customerNumber,
    direction: "OUTBOUND",
    message: outboundMessage,
    modelUsed
  });

  return reply.status(200).send({ success: true });
}
