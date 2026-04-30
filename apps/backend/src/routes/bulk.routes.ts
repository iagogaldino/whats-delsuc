import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/auth-middleware.js";
import { sendBulkController } from "../controllers/bulk.controller.js";

export async function bulkRoutes(app: FastifyInstance): Promise<void> {
  app.post("/bulk/send", { preHandler: requireAuth }, sendBulkController);
}
