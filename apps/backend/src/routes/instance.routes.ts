import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/auth-middleware.js";
import {
  createInstanceController,
  deleteInstanceController,
  listInstancesController,
  scanInstanceMcpToolsController,
  startInstanceController,
  updateInstanceAutoReplyController
} from "../controllers/instance.controller.js";

export async function instanceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/instances", { preHandler: requireAuth }, listInstancesController);
  app.post("/instances", { preHandler: requireAuth }, createInstanceController);
  app.post("/instances/:instanceId/start", { preHandler: requireAuth }, startInstanceController);
  app.delete("/instances/:instanceId", { preHandler: requireAuth }, deleteInstanceController);
  app.put("/instances/:instanceId/auto-reply", { preHandler: requireAuth }, updateInstanceAutoReplyController);
  app.post(
    "/instances/:instanceId/mcp-tools/scan",
    { preHandler: requireAuth },
    scanInstanceMcpToolsController
  );
}
