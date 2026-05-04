import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { env } from "./lib/env.js";
import { connectMongo } from "./lib/mongo.js";
import { webhookRoutes } from "./routes/webhook.routes.js";
import { instanceRoutes } from "./routes/instance.routes.js";
import { authRoutes } from "./routes/auth.routes.js";
import { bulkRoutes } from "./routes/bulk.routes.js";
import { messageTemplateRoutes } from "./routes/message-template.routes.js";
import { settingsRoutes } from "./routes/settings.routes.js";
import { BulkSchedulerService } from "./services/bulk-scheduler.service.js";

const app = Fastify({ logger: true });
const bulkSchedulerService = new BulkSchedulerService();

app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["*"]
});
app.register(multipart, {
  limits: {
    fileSize: 16 * 1024 * 1024,
    files: 1
  }
});

app.get("/health", async () => ({ ok: true }));
app.register(authRoutes);
app.register(webhookRoutes);
app.register(instanceRoutes);
app.register(bulkRoutes);
app.register(messageTemplateRoutes);
app.register(settingsRoutes);

async function bootstrap() {
  try {
    await connectMongo();
    bulkSchedulerService.start();
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void bootstrap();
