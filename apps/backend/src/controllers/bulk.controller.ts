import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { InstanceRepository } from "../repositories/instance.repository.js";
import { WhatsappService } from "../services/whatsapp.service.js";

const sendBulkSchema = z.object({
  instanceId: z.string().min(1),
  numbers: z.array(z.string().min(1)).min(1),
  message: z.string().min(1)
});

const instanceRepository = new InstanceRepository();
const whatsappService = new WhatsappService();

export async function sendBulkController(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const parsed = sendBulkSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const instance = await instanceRepository.findByInstanceId(
    parsed.data.instanceId,
    request.authUser.userId
  );

  if (!instance) {
    return reply.status(404).send({ error: "Instance not found" });
  }

  for (const number of parsed.data.numbers) {
    await whatsappService.sendText({
      instanceId: instance.instanceId,
      token: instance.token,
      number,
      text: parsed.data.message
    });
  }

  return reply.status(200).send({
    success: true,
    sent: parsed.data.numbers.length,
    instanceId: instance.instanceId
  });
}
