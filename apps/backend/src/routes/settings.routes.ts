import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/auth-middleware.js";
import {
  getMcpServersCatalogController,
  getMcpServersConfigController,
  getOpenAiSettingsController,
  putMcpServersConfigController,
  putOpenAiSettingsController,
  testMcpServerController
} from "../controllers/settings.controller.js";

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/settings/openai", { preHandler: requireAuth }, getOpenAiSettingsController);
  app.put("/settings/openai", { preHandler: requireAuth }, putOpenAiSettingsController);
  app.get("/settings/mcp-servers", { preHandler: requireAuth }, getMcpServersCatalogController);
  app.get("/settings/mcp-servers/config", { preHandler: requireAuth }, getMcpServersConfigController);
  app.put("/settings/mcp-servers/config", { preHandler: requireAuth }, putMcpServersConfigController);
  app.post("/settings/mcp-servers/test", { preHandler: requireAuth }, testMcpServerController);
}
