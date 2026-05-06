import type { FastifyReply, FastifyRequest } from "fastify";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { env } from "../lib/env.js";
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
const webhookFlowLogDirectory = path.resolve(process.cwd(), "logs");
const webhookFlowLogFilePath = path.join(webhookFlowLogDirectory, "webhook-flow.log.txt");

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

function isLidAddress(value: string): boolean {
  return value.toLowerCase().endsWith("@lid");
}

function isValidPhoneNumberDigits(value: string): boolean {
  return /^\d{10,15}$/.test(value);
}

function isNonRetriableSendError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const isBadRequest = message.includes("(400)");
  const hasNoWhatsappHint =
    message.includes("nao possui whatsapp") ||
    message.includes("não possui whatsapp") ||
    message.includes("numero nao possui") ||
    message.includes("número não possui");

  return isBadRequest && hasNoWhatsappHint;
}

function serializeForLog(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "\"[unserializable]\"";
  }
}

async function writeWebhookFlowLog(
  flowId: string,
  step: string,
  details?: Record<string, unknown>
): Promise<void> {
  if (!env.WEBHOOK_FLOW_LOG_ENABLED) {
    return;
  }
  const timestamp = new Date().toISOString();
  const detailsText = details ? ` details=${serializeForLog(details)}` : "";
  const line = `${timestamp} flow=${flowId} step=${step}${detailsText}\n`;
  await mkdir(webhookFlowLogDirectory, { recursive: true });
  await appendFile(webhookFlowLogFilePath, line, "utf8");
}

export async function whatsappWebhookController(
  request: FastifyRequest<{ Body: WhatsAppWebhookBody }>,
  reply: FastifyReply
): Promise<void> {
  const payload = request.body;
  const flowId =
    payload?.messageId?.trim() ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await writeWebhookFlowLog(flowId, "webhook-received", { payload });

  const hasDirectIncomingShape =
    Boolean(payload?.messageId) &&
    Boolean(payload?.instanceId) &&
    Boolean(payload?.from) &&
    typeof payload?.text === "string";
  const isLegacyInbound = payload?.event === "on-message" && payload?.data?.direction === "inbound";
  const isInbound = hasDirectIncomingShape || isLegacyInbound;

  if (!isInbound) {
    await writeWebhookFlowLog(flowId, "ignored-not-inbound", {
      hasDirectIncomingShape,
      event: payload?.event,
      direction: payload?.data?.direction
    });
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
    await writeWebhookFlowLog(flowId, "rejected-invalid-payload", {
      instanceId,
      hasFrom: Boolean(customerNumber),
      hasBody: Boolean(inboundMessageText)
    });
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
    await writeWebhookFlowLog(flowId, "rejected-instance-not-found", { instanceId });
    return reply.status(404).send({ error: "Instance not found" });
  }

  await writeWebhookFlowLog(flowId, "instance-loaded", {
    instanceId: instance.instanceId,
    autoReplyEnabled: instance.autoReplyEnabled,
    autoReplyMode: instance.autoReplyMode
  });

  await chatLogRepository.create({
    whatsappInstanceId: instance.id,
    customerNumber,
    direction: "INBOUND",
    message: inboundMessageText
  });
  await writeWebhookFlowLog(flowId, "inbound-message-persisted", {
    customerNumber,
    inboundMessageLength: inboundMessageText.length
  });

  if (!instance.autoReplyEnabled) {
    await writeWebhookFlowLog(flowId, "ignored-auto-reply-disabled", {
      instanceId: instance.instanceId
    });
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
    const shouldBypassAllowedNumberCheck = isLidAddress(customerNumber);
    if (shouldBypassAllowedNumberCheck) {
      await writeWebhookFlowLog(flowId, "allowed-number-check-bypassed-lid", {
        inboundNumber: customerNumber,
        inboundNormalized,
        allowedNumbers
      });
    } else if (!allowedNumbers.includes(inboundNormalized)) {
      await writeWebhookFlowLog(flowId, "ignored-number-not-allowed", {
        inboundNumber: customerNumber,
        inboundNormalized,
        allowedNumbers
      });
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
  const normalizedRecipientNumber = normalizeNumber(customerNumber);

  if (!isValidPhoneNumberDigits(normalizedRecipientNumber)) {
    await writeWebhookFlowLog(flowId, "ignored-invalid-recipient-number-format", {
      customerNumber,
      normalizedRecipientNumber
    });
    return reply.status(202).send({
      ignored: true,
      reason: "invalid-recipient-number-format"
    });
  }

  if (instance.autoReplyMode === "fixed") {
    await writeWebhookFlowLog(flowId, "auto-reply-fixed-started", {
      fixedReplyTemplateId: instance.fixedReplyTemplateId
    });
    const selectedTemplateId = instance.fixedReplyTemplateId?.trim();
    if (selectedTemplateId) {
      const selectedTemplate = await messageTemplateRepository.findByIdForUser(
        selectedTemplateId,
        instance.userId
      );
      if (selectedTemplate) {
        await writeWebhookFlowLog(flowId, "fixed-template-loaded", {
          templateId: selectedTemplate.id,
          templateName: selectedTemplate.name
        });
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
      await writeWebhookFlowLog(flowId, "ignored-fixed-message-empty", {
        fixedReplyTemplateId: instance.fixedReplyTemplateId
      });
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
    await writeWebhookFlowLog(flowId, "auto-reply-ai-started", {
      aiMcpEnabled: instance.aiMcpEnabled,
      aiMcpAllowedServerIds: instance.aiMcpAllowedServerIds,
      aiMcpMaxSteps: instance.aiMcpMaxSteps
    });
    const owner = await userRepository.findById(instance.userId);
    outboundMessage = await aiService.generateReply({
      userOpenAiApiKey: owner?.openaiApiKey,
      systemPrompt: instance.systemPrompt,
      inboundMessageText,
      mcp: {
        enabled: instance.aiMcpEnabled,
        allowedServerIds: instance.aiMcpAllowedServerIds,
        maxSteps: instance.aiMcpMaxSteps,
        servers: owner?.mcpServers ?? []
      }
    });
    modelUsed = aiService.getModelName();
    await writeWebhookFlowLog(flowId, "ai-reply-generated", {
      modelUsed,
      outboundMessageLength: outboundMessage.length
    });
  }

  try {
    await writeWebhookFlowLog(flowId, "send-attempt-started", {
      originalCustomerNumber: customerNumber,
      normalizedRecipientNumber,
      isLidAddress: isLidAddress(customerNumber)
    });

    await whatsappService.sendText({
      instanceId: instance.instanceId,
      token: instance.token,
      number: normalizedRecipientNumber,
      text: outboundMessage
    });
    await writeWebhookFlowLog(flowId, "whatsapp-message-sent", {
      customerNumber,
      normalizedRecipientNumber,
      outboundMessageLength: outboundMessage.length
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const nonRetriable = isNonRetriableSendError(error);
    await writeWebhookFlowLog(flowId, "send-failed", {
      nonRetriable,
      errorMessage,
      originalCustomerNumber: customerNumber,
      normalizedRecipientNumber,
      isLidAddress: isLidAddress(customerNumber)
    });

    if (nonRetriable) {
      request.log.info(
        {
          reason: "non-retriable-send-error",
          instanceId: instance.instanceId,
          customerNumber,
          errorMessage
        },
        "Webhook acknowledged despite outbound send failure"
      );
      return reply.status(202).send({
        ignored: true,
        reason: "non-retriable-send-error"
      });
    }

    throw error;
  }

  await chatLogRepository.create({
    whatsappInstanceId: instance.id,
    customerNumber,
    direction: "OUTBOUND",
    message: outboundMessage,
    modelUsed
  });
  await writeWebhookFlowLog(flowId, "outbound-message-persisted", {
    modelUsed: modelUsed ?? null
  });
  await writeWebhookFlowLog(flowId, "flow-finished-success");

  return reply.status(200).send({ success: true });
}
