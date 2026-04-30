import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { MessageTemplateRepository } from "../repositories/message-template.repository.js";

const templateRepository = new MessageTemplateRepository();

const saveTemplateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(4000)
});

function toPublicTemplate(template: {
  id: string;
  name: string;
  content: string;
  placeholders: string[];
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: template.id,
    name: template.name,
    content: template.content,
    placeholders: template.placeholders,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString()
  };
}

export async function listMessageTemplatesController(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const templates = await templateRepository.listByUserId(request.authUser.userId);
  return reply.status(200).send(templates.map(toPublicTemplate));
}

export async function createMessageTemplateController(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const parsed = saveTemplateSchema.safeParse(request.body && typeof request.body === "object" ? request.body : {});
  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const created = await templateRepository.create({
    userId: request.authUser.userId,
    name: parsed.data.name,
    content: parsed.data.content
  });

  return reply.status(201).send(toPublicTemplate(created));
}

export async function updateMessageTemplateController(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const paramsSchema = z.object({ templateId: z.string().min(1) });
  const parsedParams = paramsSchema.safeParse(request.params);
  if (!parsedParams.success) {
    return reply.status(400).send({ error: "Invalid params" });
  }

  const parsedBody = saveTemplateSchema.safeParse(
    request.body && typeof request.body === "object" ? request.body : {}
  );
  if (!parsedBody.success) {
    return reply.status(400).send({ error: "Invalid payload", details: parsedBody.error.flatten() });
  }

  const updated = await templateRepository.update({
    templateId: parsedParams.data.templateId,
    userId: request.authUser.userId,
    name: parsedBody.data.name,
    content: parsedBody.data.content
  });

  if (!updated) {
    return reply.status(404).send({ error: "Template not found" });
  }

  return reply.status(200).send(toPublicTemplate(updated));
}

export async function deleteMessageTemplateController(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const paramsSchema = z.object({ templateId: z.string().min(1) });
  const parsedParams = paramsSchema.safeParse(request.params);
  if (!parsedParams.success) {
    return reply.status(400).send({ error: "Invalid params" });
  }

  const deleted = await templateRepository.delete(parsedParams.data.templateId, request.authUser.userId);
  if (!deleted) {
    return reply.status(404).send({ error: "Template not found" });
  }

  return reply.status(204).send();
}

