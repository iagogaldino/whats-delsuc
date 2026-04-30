import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { MessageTemplateRepository } from "../repositories/message-template.repository.js";

const templateRepository = new MessageTemplateRepository();

const saveTemplateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(4000)
});
const MAX_MEDIA_FILE_BYTES = 16 * 1024 * 1024;

function toPublicTemplate(template: {
  id: string;
  name: string;
  content: string;
  media?: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  };
  placeholders: string[];
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: template.id,
    name: template.name,
    content: template.content,
    media: template.media
      ? {
          fileName: template.media.fileName,
          mimeType: template.media.mimeType,
          sizeBytes: template.media.sizeBytes
        }
      : undefined,
    placeholders: template.placeholders,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString()
  };
}

async function parseTemplatePayload(
  request: FastifyRequest
): Promise<{
  name?: string;
  content?: string;
  media?: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    dataBase64: string;
  };
}> {
  if (!request.isMultipart()) {
    return (request.body && typeof request.body === "object" ? request.body : {}) as {
      name?: string;
      content?: string;
    };
  }

  const payload: {
    name?: string;
    content?: string;
    media?: {
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      dataBase64: string;
    };
  } = {};

  for await (const part of request.parts({ limits: { fileSize: MAX_MEDIA_FILE_BYTES } })) {
    if (part.type === "file") {
      if (part.fieldname !== "file") {
        continue;
      }
      const buffer = await part.toBuffer();
      payload.media = {
        fileName: part.filename,
        mimeType: part.mimetype,
        sizeBytes: buffer.length,
        dataBase64: buffer.toString("base64")
      };
      continue;
    }
    if (part.fieldname === "name") {
      payload.name = String(part.value ?? "");
      continue;
    }
    if (part.fieldname === "content") {
      payload.content = String(part.value ?? "");
    }
  }

  return payload;
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

  const parsedPayload = await parseTemplatePayload(request);
  const parsed = saveTemplateSchema.safeParse(parsedPayload);
  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const created = await templateRepository.create({
    userId: request.authUser.userId,
    name: parsed.data.name,
    content: parsed.data.content,
    media: parsedPayload.media
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

  const parsedPayload = await parseTemplatePayload(request);
  const parsedBody = saveTemplateSchema.safeParse(parsedPayload);
  if (!parsedBody.success) {
    return reply.status(400).send({ error: "Invalid payload", details: parsedBody.error.flatten() });
  }

  const updated = await templateRepository.update({
    templateId: parsedParams.data.templateId,
    userId: request.authUser.userId,
    name: parsedBody.data.name,
    content: parsedBody.data.content,
    media: parsedPayload.media
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

export async function getMessageTemplateMediaController(
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

  const template = await templateRepository.findByIdForUser(parsedParams.data.templateId, request.authUser.userId);
  if (!template?.media) {
    return reply.status(404).send({ error: "Template media not found" });
  }

  const buffer = Buffer.from(template.media.dataBase64, "base64");
  reply.header("Content-Type", template.media.mimeType);
  reply.header("Content-Length", String(buffer.length));
  return reply.status(200).send(buffer);
}

