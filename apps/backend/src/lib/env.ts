import { config } from "dotenv";
import path from "node:path";
import { z } from "zod";

config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), "../../.env"), override: false });

const mcpStdioServerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  transport: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional()
});

export type McpServerCatalogEntry = z.infer<typeof mcpStdioServerSchema>;

function parseMcpServersJson(raw: string | undefined): McpServerCatalogEntry[] {
  if (raw === undefined || raw.trim() === "") {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("MCP_SERVERS_JSON must be valid JSON.");
  }
  const arrayParsed = z.array(mcpStdioServerSchema).safeParse(parsed);
  if (!arrayParsed.success) {
    throw new Error(`Invalid MCP_SERVERS_JSON: ${arrayParsed.error.message}`);
  }
  const ids = new Set<string>();
  for (const entry of arrayParsed.data) {
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate MCP server id in MCP_SERVERS_JSON: ${entry.id}`);
    }
    ids.add(entry.id);
  }
  return arrayParsed.data;
}

const envSchema = z
  .object({
    PORT: z.coerce.number().default(3333),
    // Opcional: fallback no servidor se a instância não tiver chave na interface.
    OPENAI_API_KEY: z.preprocess(
      (value) => (value === "" || value === undefined ? undefined : value),
      z.string().min(1).optional()
    ),
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
    JWT_EXPIRES_IN: z.string().default("1d"),
    WEBHOOK_FLOW_LOG_ENABLED: z.coerce.boolean().default(false),
    MCP_SERVERS_JSON: z
      .preprocess(
        (value) => (value === "" || value === undefined ? undefined : value),
        z.string().optional()
      )
      .optional()
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

/** Catálogo MCP parseado de `MCP_SERVERS_JSON` (stdio). */
export function getMcpServerCatalog(): McpServerCatalogEntry[] {
  return parseMcpServersJson(env.MCP_SERVERS_JSON);
}
