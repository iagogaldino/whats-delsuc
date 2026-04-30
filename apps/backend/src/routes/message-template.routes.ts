import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/auth-middleware.js";
import {
  createMessageTemplateController,
  deleteMessageTemplateController,
  getMessageTemplateMediaController,
  listMessageTemplatesController,
  updateMessageTemplateController
} from "../controllers/message-template.controller.js";

export async function messageTemplateRoutes(app: FastifyInstance): Promise<void> {
  app.get("/message-templates", { preHandler: requireAuth }, listMessageTemplatesController);
  app.post("/message-templates", { preHandler: requireAuth }, createMessageTemplateController);
  app.put("/message-templates/:templateId", { preHandler: requireAuth }, updateMessageTemplateController);
  app.get(
    "/message-templates/:templateId/media",
    { preHandler: requireAuth },
    getMessageTemplateMediaController
  );
  app.delete("/message-templates/:templateId", { preHandler: requireAuth }, deleteMessageTemplateController);
}

