import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { InstanceRepository } from "../repositories/instance.repository.js";
import type { WhatsappInstanceModel } from "../repositories/instance.repository.js";
import { UserRepository } from "../repositories/user.repository.js";
import { WhatsappService } from "../services/whatsapp.service.js";
import { env } from "../lib/env.js";

const createInstanceSchema = z.object({
  name: z.string().min(1).optional()
});

const updateAutoReplySchema = z
  .object({
    autoReplyEnabled: z.boolean(),
    autoReplyMode: z.enum(["fixed", "ai"]),
    fixedReplyMessage: z.string().trim().optional(),
    fixedReplyTemplateId: z.string().trim().optional(),
    systemPrompt: z.string().trim().optional()
  })
  .superRefine((data, ctx) => {
    const hasFixedMessage = Boolean(data.fixedReplyMessage && data.fixedReplyMessage.length > 0);
    const hasFixedTemplate = Boolean(data.fixedReplyTemplateId && data.fixedReplyTemplateId.length > 0);

    if (data.autoReplyMode === "fixed" && !hasFixedMessage && !hasFixedTemplate) {
      ctx.addIssue({
        code: "custom",
        path: ["fixedReplyMessage"],
        message: "fixedReplyMessage or fixedReplyTemplateId is required when autoReplyMode is fixed"
      });
    }

    if (data.autoReplyMode === "ai" && (!data.systemPrompt || data.systemPrompt.length === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["systemPrompt"],
        message: "systemPrompt is required when autoReplyMode is ai"
      });
    }
  });

const instanceRepository = new InstanceRepository();
const userRepository = new UserRepository();
const whatsappService = new WhatsappService();

function getConfiguredWebhookUrl(): string {
  if (env.INSTANCE_WEBHOOK_URL) {
    const rawUrl = new URL(env.INSTANCE_WEBHOOK_URL);
    const hasCustomPath = rawUrl.pathname !== "/" && rawUrl.pathname.length > 0;
    if (hasCustomPath) {
      return rawUrl.toString();
    }

    const normalizedBase = rawUrl.toString().endsWith("/") ? rawUrl.toString() : `${rawUrl.toString()}/`;
    return new URL("webhooks/whatsapp", normalizedBase).toString();
  }

  const base = env.INSTANCE_WEBHOOK_BASE_URL;
  if (!base) {
    throw new Error("Missing INSTANCE_WEBHOOK_BASE_URL (or INSTANCE_WEBHOOK_URL).");
  }

  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return new URL("webhooks/whatsapp", normalizedBase).toString();
}

function toPublicInstance(inst: WhatsappInstanceModel) {
  return {
    id: inst.id,
    instanceId: inst.instanceId,
    displayName: inst.displayName,
    status: inst.status,
    autoReplyEnabled: inst.autoReplyEnabled,
    autoReplyMode: inst.autoReplyMode,
    fixedReplyMessage: inst.fixedReplyMessage,
    fixedReplyTemplateId: inst.fixedReplyTemplateId,
    systemPrompt: inst.systemPrompt,
    createdAt: inst.createdAt.toISOString(),
    updatedAt: inst.updatedAt.toISOString()
  };
}

export async function listInstancesController(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const instances = await instanceRepository.listByUserId(request.authUser.userId);

  await Promise.all(
    instances.map(async (instance) => {
      try {
        const liveStatus = await whatsappService.getWhatsAppConnectionStatusV1(
          instance.instanceId,
          instance.token
        );
        if (liveStatus !== instance.status) {
          await instanceRepository.updateStatus(instance.instanceId, liveStatus);
          instance.status = liveStatus;
        }
      } catch {
        // keep persisted status when live query fails
      }
    })
  );

  return reply.status(200).send(instances.map(toPublicInstance));
}

export async function createInstanceController(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const parsed = createInstanceSchema.safeParse(
    request.body && typeof request.body === "object" ? request.body : {}
  );
  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const user = await userRepository.findById(request.authUser.userId);
  if (!user) {
    return reply.status(401).send({ error: "User not found" });
  }

  if (!user.waApiToken) {
    return reply.status(400).send({ error: "No WhatsApp API token available for this user" });
  }

  const defaultName = `WhatsDelsuc-${user.email}`;
  const nameForSaaS = parsed.data.name ?? defaultName;

  let saasResult: { instanceId: string; name?: string };
  try {
    saasResult = await whatsappService.createInstanceV1(user.waApiToken, {
      name: nameForSaaS
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create instance on WhatsApp Connect.";
    return reply.status(502).send({ error: message });
  }

  const created = await instanceRepository.create({
    userId: request.authUser.userId,
    instanceId: saasResult.instanceId,
    token: user.waApiToken,
    displayName: saasResult.name ?? nameForSaaS
  });

  return reply.status(201).send({
    ...toPublicInstance(created)
  });
}

export async function startInstanceController(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const paramsSchema = z.object({ instanceId: z.string().min(1) });
  const parsedParams = paramsSchema.safeParse(request.params);
  if (!parsedParams.success) {
    return reply.status(400).send({ error: "Invalid params" });
  }

  const { instanceId } = parsedParams.data;
  const instance = await instanceRepository.findByInstanceId(instanceId, request.authUser.userId);

  if (!instance) {
    return reply.status(404).send({ error: "Instance not found" });
  }

  try {
    const currentStatus = await whatsappService.getWhatsAppConnectionStatusV1(
      instance.instanceId,
      instance.token
    );
    await instanceRepository.updateStatus(instanceId, currentStatus);
    if (currentStatus === "CONNECTED") {
      return reply.status(200).send({
        instanceId: instance.instanceId,
        connected: true
      });
    }
  } catch {
    // continue with pairing flow if status endpoint is temporarily unavailable
  }

  let qrCode: string | null;
  try {
    qrCode = await whatsappService.startInstanceAndGetQrCode({
      instanceId: instance.instanceId,
      token: instance.token
    });
  } catch (error) {
    try {
      const status = await whatsappService.getWhatsAppConnectionStatusV1(
        instance.instanceId,
        instance.token
      );
      await instanceRepository.updateStatus(instanceId, status);
      if (status === "CONNECTED") {
        return reply.status(200).send({
          instanceId: instance.instanceId,
          connected: true
        });
      }
    } catch {
      // if status lookup also fails, fall back to original error response
    }

    await instanceRepository.updateStatus(instanceId, "DISCONNECTED");
    const message = error instanceof Error ? error.message : "Erro ao parear com WhatsApp Connect.";
    return reply.status(502).send({ error: message });
  }

  if (!qrCode) {
    const status = await whatsappService.getWhatsAppConnectionStatusV1(
      instance.instanceId,
      instance.token
    );
    await instanceRepository.updateStatus(instanceId, status);
    if (status === "CONNECTED") {
      return reply.status(200).send({
        instanceId: instance.instanceId,
        connected: true
      });
    }

    return reply.status(502).send({
      error: "Nao foi possivel obter QR Code da integracao WhatsApp Connect."
    });
  }

  await instanceRepository.updateStatus(instanceId, "DISCONNECTED");
  return reply.status(200).send({ instanceId: instance.instanceId, qrCode });
}

export async function updateInstanceAutoReplyController(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const paramsSchema = z.object({ instanceId: z.string().min(1) });
  const parsedParams = paramsSchema.safeParse(request.params);
  if (!parsedParams.success) {
    return reply.status(400).send({ error: "Invalid params" });
  }

  const parsedBody = updateAutoReplySchema.safeParse(
    request.body && typeof request.body === "object" ? request.body : {}
  );
  if (!parsedBody.success) {
    return reply.status(400).send({ error: "Invalid payload", details: parsedBody.error.flatten() });
  }

  const instance = await instanceRepository.findByInstanceId(
    parsedParams.data.instanceId,
    request.authUser.userId
  );
  if (!instance) {
    return reply.status(404).send({ error: "Instance not found" });
  }

  const user = await userRepository.findById(request.authUser.userId);
  if (!user?.waSessionJwt) {
    return reply.status(400).send({ error: "No WhatsApp session JWT available for this user" });
  }

  const fixedReplyMessage = (parsedBody.data.fixedReplyMessage ?? "").trim();
  const fixedReplyTemplateId = parsedBody.data.fixedReplyTemplateId?.trim() || undefined;
  const systemPrompt = (parsedBody.data.systemPrompt ?? instance.systemPrompt).trim();

  if (parsedBody.data.autoReplyEnabled) {
    try {
      await whatsappService.setInstanceWebhookConfig({
        sessionJwt: user.waSessionJwt,
        instanceId: instance.instanceId,
        url: getConfiguredWebhookUrl(),
        enabled: true
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to enable WhatsApp webhook for this instance.";
      return reply.status(502).send({ error: message });
    }
  }

  const updated = await instanceRepository.updateAutoReplyConfig({
    instanceId: instance.instanceId,
    userId: request.authUser.userId,
    autoReplyEnabled: parsedBody.data.autoReplyEnabled,
    autoReplyMode: parsedBody.data.autoReplyMode,
    fixedReplyMessage,
    fixedReplyTemplateId,
    systemPrompt
  });

  if (!updated) {
    return reply.status(404).send({ error: "Instance not found" });
  }

  return reply.status(200).send(toPublicInstance(updated));
}
