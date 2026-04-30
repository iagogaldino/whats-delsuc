import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/auth-middleware.js";
import {
  createInstanceController,
  listInstancesController,
  startInstanceController,
  updateInstanceAutoReplyController
} from "../controllers/instance.controller.js";

export async function instanceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/instances", { preHandler: requireAuth }, listInstancesController);
  app.post("/instances", { preHandler: requireAuth }, createInstanceController);
  app.post("/instances/:instanceId/start", { preHandler: requireAuth }, startInstanceController);
  app.put("/instances/:instanceId/auto-reply", { preHandler: requireAuth }, updateInstanceAutoReplyController);
}
