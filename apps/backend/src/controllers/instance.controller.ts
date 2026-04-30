import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { InstanceRepository } from "../repositories/instance.repository.js";
import type { WhatsappInstanceModel } from "../repositories/instance.repository.js";
import { UserRepository } from "../repositories/user.repository.js";
import { WhatsappService } from "../services/whatsapp.service.js";

const createInstanceSchema = z.object({
  name: z.string().min(1).optional()
});

const instanceRepository = new InstanceRepository();
const userRepository = new UserRepository();
const whatsappService = new WhatsappService();

function toPublicInstance(inst: WhatsappInstanceModel) {
  return {
    id: inst.id,
    instanceId: inst.instanceId,
    displayName: inst.displayName,
    status: inst.status,
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
