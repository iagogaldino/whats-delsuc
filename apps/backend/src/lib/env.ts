import { config } from "dotenv";
import path from "node:path";
import { z } from "zod";

config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), "../../.env"), override: false });

const envSchema = z
  .object({
    PORT: z.coerce.number().default(3333),
    OPENAI_API_KEY: z.string().min(1),
    WHATSAPP_CONNECT_BASE_URL: z.string().url(),
    WHATSAPP_CONNECT_API_KEY: z
      .union([z.string().min(1), z.literal("")])
      .optional()
      .transform((value) => (value === "" ? undefined : value)),
    WHATSAPP_CONNECT_EMAIL: z.string().email(),
    WHATSAPP_CONNECT_PASSWORD: z.string().min(1),
    INSTANCE_WEBHOOK_BASE_URL: z.string().url().optional(),
    INSTANCE_WEBHOOK_URL: z.string().url().optional(),
    MONGODB_URI: z.string().min(1),
    JWT_SECRET: z.string().min(10),
    JWT_EXPIRES_IN: z.string().default("1d")
  })
  .refine((data) => Boolean(data.INSTANCE_WEBHOOK_BASE_URL || data.INSTANCE_WEBHOOK_URL), {
    message: "Configure INSTANCE_WEBHOOK_BASE_URL (ou legacy INSTANCE_WEBHOOK_URL).",
    path: ["INSTANCE_WEBHOOK_BASE_URL"]
  })
  .superRefine((data, ctx) => {
    if (!data.INSTANCE_WEBHOOK_BASE_URL) {
      return;
    }

    const baseUrl = new URL(data.INSTANCE_WEBHOOK_BASE_URL);
    const normalizedPath = baseUrl.pathname.replace(/\/+$/, "");
    if (normalizedPath.length > 0 && normalizedPath !== "/") {
      ctx.addIssue({
        code: "custom",
        path: ["INSTANCE_WEBHOOK_BASE_URL"],
        message: "Use apenas dominio/base (sem path). Exemplo: https://seu-backend.com"
      });
    }
  });

export const env = envSchema.parse(process.env);
