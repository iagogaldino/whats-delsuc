import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { UserRepository } from "../repositories/user.repository.js";
import type { UserModel } from "../repositories/user.repository.js";
import { McpClientService } from "../services/mcp-client.service.js";

const updateOpenAiKeySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set"), openaiApiKey: z.string().min(1) }),
  z.object({ type: z.literal("clear") })
]);

const stdioMcpServerSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  transport: z.literal("stdio"),
  command: z.string().trim().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().trim().min(1).optional()
});

const httpMcpServerSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  transport: z.literal("http"),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional()
});

const mcpServerSchema = z.discriminatedUnion("transport", [stdioMcpServerSchema, httpMcpServerSchema]);

const updateMcpServersSchema = z.object({
  items: z.array(mcpServerSchema)
});

const testMcpServerSchema = z.object({
  server: mcpServerSchema
});

const userRepository = new UserRepository();
const mcpClientService = new McpClientService();

function openAiPayload(user: UserModel | null) {
  const key = user?.openaiApiKey?.trim();
  return { hasOpenAiKey: Boolean(key && key.length > 0) };
}

export async function getOpenAiSettingsController(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const user = await userRepository.findById(request.authUser.userId);
  if (!user) {
    return reply.status(401).send({ error: "User not found" });
  }

  return reply.status(200).send(openAiPayload(user));
}

export async function putOpenAiSettingsController(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const parsedBody = updateOpenAiKeySchema.safeParse(
    request.body && typeof request.body === "object" ? request.body : {}
  );
  if (!parsedBody.success) {
    return reply.status(400).send({ error: "Invalid payload", details: parsedBody.error.flatten() });
  }

  const nextKey =
    parsedBody.data.type === "set" ? parsedBody.data.openaiApiKey.trim() : undefined;
  const cleared = parsedBody.data.type === "clear";

  try {
    const updated = await userRepository.updateOpenAiApiKey(
      request.authUser.userId,
      cleared ? undefined : nextKey
    );
    if (!updated) {
      return reply.status(404).send({ error: "User not found" });
    }
    return reply.status(200).send(openAiPayload(updated));
  } catch {
    return reply.status(400).send({ error: "Invalid request" });
  }
}

export async function getMcpServersCatalogController(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const user = await userRepository.findById(request.authUser.userId);
  if (!user) {
    return reply.status(401).send({ error: "User not found" });
  }
  return reply.status(200).send({
    items: user.mcpServers.map((entry) => ({ id: entry.id, name: entry.name }))
  });
}

export async function getMcpServersConfigController(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const user = await userRepository.findById(request.authUser.userId);
  if (!user) {
    return reply.status(401).send({ error: "User not found" });
  }
  return reply.status(200).send({ items: user.mcpServers });
}

export async function putMcpServersConfigController(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const parsedBody = updateMcpServersSchema.safeParse(
    request.body && typeof request.body === "object" ? request.body : {}
  );
  if (!parsedBody.success) {
    return reply.status(400).send({ error: "Invalid payload", details: parsedBody.error.flatten() });
  }

  const ids = new Set<string>();
  for (const item of parsedBody.data.items) {
    if (ids.has(item.id)) {
      return reply.status(400).send({ error: `Duplicate MCP server id: ${item.id}` });
    }
    ids.add(item.id);
  }

  const updated = await userRepository.updateMcpServers(request.authUser.userId, parsedBody.data.items);
  if (!updated) {
    return reply.status(404).send({ error: "User not found" });
  }

  return reply.status(200).send({ items: updated.mcpServers });
}

export async function testMcpServerController(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const parsedBody = testMcpServerSchema.safeParse(
    request.body && typeof request.body === "object" ? request.body : {}
  );
  if (!parsedBody.success) {
    return reply.status(400).send({ error: "Invalid payload", details: parsedBody.error.flatten() });
  }

  try {
    const result = await mcpClientService.testServerConnection(parsedBody.data.server);
    return reply.status(200).send(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao conectar no servidor MCP informado.";
    return reply.status(400).send({ error: message });
  }
}
