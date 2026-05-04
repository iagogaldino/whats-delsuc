import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { UserRepository } from "../repositories/user.repository.js";
import type { UserModel } from "../repositories/user.repository.js";

const updateOpenAiKeySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set"), openaiApiKey: z.string().min(1) }),
  z.object({ type: z.literal("clear") })
]);

const userRepository = new UserRepository();

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
