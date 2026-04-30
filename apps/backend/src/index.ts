import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./lib/env.js";
import { connectMongo } from "./lib/mongo.js";
import { webhookRoutes } from "./routes/webhook.routes.js";
import { instanceRoutes } from "./routes/instance.routes.js";
import { authRoutes } from "./routes/auth.routes.js";
import { bulkRoutes } from "./routes/bulk.routes.js";
import { messageTemplateRoutes } from "./routes/message-template.routes.js";

const app = Fastify({ logger: true });

app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["*"]
});

app.get("/health", async () => ({ ok: true }));
app.register(authRoutes);
app.register(webhookRoutes);
app.register(instanceRoutes);
app.register(bulkRoutes);
app.register(messageTemplateRoutes);

async function bootstrap() {
  try {
    await connectMongo();
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void bootstrap();
