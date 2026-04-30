import type { FastifyInstance } from "fastify";
import { whatsappWebhookController } from "../controllers/webhook.controller.js";

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post("/webhooks/whatsapp", whatsappWebhookController);
}
