import type { FastifyReply, FastifyRequest } from "fastify";
import { AIService } from "../services/ai.service.js";
import { WhatsappService } from "../services/whatsapp.service.js";
import { InstanceRepository } from "../repositories/instance.repository.js";
import { UserRepository } from "../repositories/user.repository.js";
import { ChatLogRepository } from "../repositories/chat-log.repository.js";
import { MessageTemplateRepository } from "../repositories/message-template.repository.js";

type WhatsAppWebhookBody = {
  messageId?: string;
  from?: string;
  to?: string | null;
  timestamp?: string;
  text?: string;
  userId?: string;
  instanceId?: string;
  // legacy compatibility
  event?: string;
  data?: {
    direction?: "inbound" | "outbound";
    from?: string;
    body?: string;
  };
};

const aiService = new AIService();
const whatsappService = new WhatsappService();
const instanceRepository = new InstanceRepository();
const userRepository = new UserRepository();
const chatLogRepository = new ChatLogRepository();
const messageTemplateRepository = new MessageTemplateRepository();

function renderTemplateWithContext(
  content: string,
  context: Record<string, string>
): string {
  return content.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (whole, key: string) => {
    const normalized = key.trim().toLowerCase();
    return context[normalized] ?? whole;
  });
}

function normalizeNumber(value: string): string {
  return value.replace(/\D+/g, "");
}

export async function whatsappWebhookController(
  request: FastifyRequest<{ Body: WhatsAppWebhookBody }>,
  reply: FastifyReply
): Promise<void> {
  const payload = request.body;
  const hasDirectIncomingShape =
    Boolean(payload?.messageId) &&
    Boolean(payload?.instanceId) &&
    Boolean(payload?.from) &&
    typeof payload?.text === "string";
  const isLegacyInbound = payload?.event === "on-message" && payload?.data?.direction === "inbound";
  const isInbound = hasDirectIncomingShape || isLegacyInbound;

  if (!isInbound) {
    request.log.info(
      {
        reason: "not-inbound",
        hasDirectIncomingShape,
        event: payload?.event,
        direction: payload?.data?.direction
      },
      "Webhook ignored"
    );
    return reply.status(202).send({ ignored: true });
  }

  const instanceId = payload.instanceId;
  const customerNumber = (payload.from ?? payload.data?.from)?.trim();
  const inboundMessageText = (payload.text ?? payload.data?.body)?.trim();

  if (!instanceId || !customerNumber || !inboundMessageText) {
    request.log.info(
      {
        reason: "invalid-payload",
        instanceId,
        hasFrom: Boolean(customerNumber),
        hasBody: Boolean(inboundMessageText)
      },
      "Webhook rejected"
    );
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
    request.log.info(
      {
        reason: "auto-reply-disabled",
        instanceId: instance.instanceId
      },
      "Webhook ignored"
    );
    return reply.status(202).send({ ignored: true, reason: "auto-reply-disabled" });
  }

  const allowedNumbers = instance.autoReplyAllowedNumbers
    .map((item) => normalizeNumber(item))
    .filter((item) => item.length > 0);

  if (allowedNumbers.length > 0) {
    const inboundNormalized = normalizeNumber(customerNumber);
    if (!allowedNumbers.includes(inboundNormalized)) {
      request.log.info(
        {
          reason: "number-not-allowed",
          instanceId: instance.instanceId,
          inboundNumber: customerNumber,
          inboundNormalized,
          allowedNumbers
        },
        "Webhook ignored"
      );
      return reply.status(202).send({ ignored: true, reason: "number-not-allowed" });
    }
  }

  let outboundMessage = "";
  let modelUsed: string | undefined;

  if (instance.autoReplyMode === "fixed") {
    const selectedTemplateId = instance.fixedReplyTemplateId?.trim();
    if (selectedTemplateId) {
      const selectedTemplate = await messageTemplateRepository.findByIdForUser(
        selectedTemplateId,
        instance.userId
      );
      if (selectedTemplate) {
        outboundMessage = renderTemplateWithContext(selectedTemplate.content, {
          telefone: customerNumber,
          mensagem: inboundMessageText,
          instanciaid: instance.instanceId
        }).trim();
      }
    }

    if (!outboundMessage) {
      outboundMessage = instance.fixedReplyMessage.trim();
    }

    if (!outboundMessage) {
      request.log.info(
        {
          reason: "fixed-message-empty",
          instanceId: instance.instanceId,
          fixedReplyTemplateId: instance.fixedReplyTemplateId
        },
        "Webhook ignored"
      );
      return reply.status(202).send({ ignored: true, reason: "fixed-message-empty" });
    }
  } else {
    const owner = await userRepository.findById(instance.userId);
    outboundMessage = await aiService.generateReply({
      userOpenAiApiKey: owner?.openaiApiKey,
      systemPrompt: instance.systemPrompt,
      inboundMessageText
    });
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
