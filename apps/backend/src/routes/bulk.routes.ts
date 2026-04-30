import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/auth-middleware.js";
import {
  cancelBulkScheduleController,
  createBulkScheduleController,
  getBulkJobController,
  listBulkJobsController,
  listBulkSchedulesController,
  updateBulkScheduleController,
  sendBulkController
} from "../controllers/bulk.controller.js";

export async function bulkRoutes(app: FastifyInstance): Promise<void> {
  app.post("/bulk/send", { preHandler: requireAuth }, sendBulkController);
  app.get("/bulk/jobs", { preHandler: requireAuth }, listBulkJobsController);
  app.get("/bulk/jobs/:jobId", { preHandler: requireAuth }, getBulkJobController);
  app.post("/bulk/schedules", { preHandler: requireAuth }, createBulkScheduleController);
  app.get("/bulk/schedules", { preHandler: requireAuth }, listBulkSchedulesController);
  app.put("/bulk/schedules/:jobId", { preHandler: requireAuth }, updateBulkScheduleController);
  app.delete("/bulk/schedules/:jobId", { preHandler: requireAuth }, cancelBulkScheduleController);
}
