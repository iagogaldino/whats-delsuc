import { config } from "dotenv";
import path from "node:path";
import { z } from "zod";

config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), "../../.env"), override: false });

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  OPENAI_API_KEY: z.string().min(1),
  WHATSAPP_CONNECT_BASE_URL: z.string().url(),
  WHATSAPP_CONNECT_API_KEY: z
    .union([z.string().min(1), z.literal("")])
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  WHATSAPP_CONNECT_EMAIL: z.string().email(),
  WHATSAPP_CONNECT_PASSWORD: z.string().min(1),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(10),
  JWT_EXPIRES_IN: z.string().default("1d")
});

export const env = envSchema.parse(process.env);
