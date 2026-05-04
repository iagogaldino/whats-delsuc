import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/auth-middleware.js";
import { getOpenAiSettingsController, putOpenAiSettingsController } from "../controllers/settings.controller.js";

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/settings/openai", { preHandler: requireAuth }, getOpenAiSettingsController);
  app.put("/settings/openai", { preHandler: requireAuth }, putOpenAiSettingsController);
}
