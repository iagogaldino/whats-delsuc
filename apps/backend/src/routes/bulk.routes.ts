import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/auth-middleware.js";
import {
  getBulkJobController,
  listBulkJobsController,
  sendBulkController
} from "../controllers/bulk.controller.js";

export async function bulkRoutes(app: FastifyInstance): Promise<void> {
  app.post("/bulk/send", { preHandler: requireAuth }, sendBulkController);
  app.get("/bulk/jobs", { preHandler: requireAuth }, listBulkJobsController);
  app.get("/bulk/jobs/:jobId", { preHandler: requireAuth }, getBulkJobController);
}
