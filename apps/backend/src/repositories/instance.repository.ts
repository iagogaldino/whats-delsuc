import { ObjectId } from "mongodb";
import { getMongoDb } from "../lib/mongo.js";

type CreateInstanceInput = {
  userId: string;
  instanceId: string;
  token: string;
  displayName?: string;
};

export type AutoReplyMode = "fixed" | "ai";

type UpdateAutoReplyInput = {
  instanceId: string;
  userId: string;
  autoReplyEnabled: boolean;
  autoReplyMode: AutoReplyMode;
  fixedReplyMessage: string;
  fixedReplyTemplateId?: string;
  autoReplyAllowedNumbers: string[];
  systemPrompt: string;
  aiMcpEnabled: boolean;
  aiMcpAllowedServerIds: string[];
  aiMcpMaxSteps: number;
};

export class InstanceRepository {
  async findByInstanceIdGlobal(instanceId: string): Promise<WhatsappInstanceModel | null> {
    const instance = await getMongoDb()
      .collection<WhatsappInstanceDocument>("whatsapp_instances")
      .findOne({ instanceId });

    return instance ? mapInstanceDocument(instance) : null;
  }

  async findByInstanceId(instanceId: string, userId: string): Promise<WhatsappInstanceModel | null> {
    const instance = await getMongoDb()
      .collection<WhatsappInstanceDocument>("whatsapp_instances")
      .findOne({ instanceId, userId });

    return instance ? mapInstanceDocument(instance) : null;
  }

  async listByUserId(userId: string): Promise<WhatsappInstanceModel[]> {
    const cursor = getMongoDb()
      .collection<WhatsappInstanceDocument>("whatsapp_instances")
      .find({ userId })
      .sort({ createdAt: -1 });

    const documents = await cursor.toArray();
    return documents.map((document) => mapInstanceDocument(document));
  }

  async create(input: CreateInstanceInput): Promise<WhatsappInstanceModel> {
    const now = new Date();
    const collection = getMongoDb().collection<WhatsappInstanceDocument>("whatsapp_instances");

    const displaySet =
      input.displayName !== undefined
        ? { displayName: input.displayName || undefined }
        : {};

    const result = await collection.findOneAndUpdate(
      { instanceId: input.instanceId },
      {
        $set: {
          userId: input.userId,
          token: input.token,
          updatedAt: now,
          ...displaySet
        },
        $setOnInsert: {
          instanceId: input.instanceId,
          status: "DISCONNECTED",
          systemPrompt: "Voce e um assistente virtual objetivo e educado.",
          autoReplyEnabled: false,
          autoReplyMode: "ai",
          fixedReplyMessage: "",
          autoReplyAllowedNumbers: [],
          aiMcpEnabled: false,
          aiMcpAllowedServerIds: [],
          aiMcpMaxSteps: 4,
          createdAt: now
        }
      },
      { upsert: true, returnDocument: "after" }
    );

    if (!result) {
      throw new Error("Failed to save instance.");
    }

    return mapInstanceDocument(result);
  }

  async updateStatus(instanceId: string, status: "CONNECTED" | "DISCONNECTED"): Promise<void> {
    await getMongoDb()
      .collection<WhatsappInstanceDocument>("whatsapp_instances")
      .updateOne({ instanceId }, { $set: { status, updatedAt: new Date() } });
  }

  async updateAutoReplyConfig(input: UpdateAutoReplyInput): Promise<WhatsappInstanceModel | null> {
    const result = await getMongoDb()
      .collection<WhatsappInstanceDocument>("whatsapp_instances")
      .findOneAndUpdate(
        { instanceId: input.instanceId, userId: input.userId },
        {
          $set: {
            autoReplyEnabled: input.autoReplyEnabled,
            autoReplyMode: input.autoReplyMode,
            fixedReplyMessage: input.fixedReplyMessage,
            fixedReplyTemplateId: input.fixedReplyTemplateId,
            autoReplyAllowedNumbers: input.autoReplyAllowedNumbers,
            systemPrompt: input.systemPrompt,
            aiMcpEnabled: input.aiMcpEnabled,
            aiMcpAllowedServerIds: input.aiMcpAllowedServerIds,
            aiMcpMaxSteps: input.aiMcpMaxSteps,
            updatedAt: new Date()
          }
        },
        { returnDocument: "after" }
      );

    return result ? mapInstanceDocument(result) : null;
  }
}

type WhatsappInstanceDocument = {
  _id: ObjectId;
  userId: string;
  instanceId: string;
  token: string;
  systemPrompt: string;
  autoReplyEnabled: boolean;
  autoReplyMode: AutoReplyMode;
  fixedReplyMessage?: string;
  fixedReplyTemplateId?: string;
  autoReplyAllowedNumbers?: string[];
  aiMcpEnabled?: boolean;
  aiMcpAllowedServerIds?: string[];
  aiMcpMaxSteps?: number;
  displayName?: string;
  status: "CONNECTED" | "DISCONNECTED";
  createdAt: Date;
  updatedAt: Date;
};

export type WhatsappInstanceModel = {
  id: string;
  userId: string;
  instanceId: string;
  token: string;
  systemPrompt: string;
  autoReplyEnabled: boolean;
  autoReplyMode: AutoReplyMode;
  fixedReplyMessage: string;
  fixedReplyTemplateId?: string;
  autoReplyAllowedNumbers: string[];
  aiMcpEnabled: boolean;
  aiMcpAllowedServerIds: string[];
  aiMcpMaxSteps: number;
  displayName?: string;
  status: "CONNECTED" | "DISCONNECTED";
  createdAt: Date;
  updatedAt: Date;
};

function mapInstanceDocument(document: WhatsappInstanceDocument): WhatsappInstanceModel {
  return {
    id: document._id.toHexString(),
    userId: document.userId,
    instanceId: document.instanceId,
    token: document.token,
    systemPrompt: document.systemPrompt,
    autoReplyEnabled: document.autoReplyEnabled ?? false,
    autoReplyMode: document.autoReplyMode ?? "ai",
    fixedReplyMessage: document.fixedReplyMessage ?? "",
    fixedReplyTemplateId: document.fixedReplyTemplateId,
    autoReplyAllowedNumbers: document.autoReplyAllowedNumbers ?? [],
    aiMcpEnabled: document.aiMcpEnabled ?? false,
    aiMcpAllowedServerIds: document.aiMcpAllowedServerIds ?? [],
    aiMcpMaxSteps: document.aiMcpMaxSteps ?? 4,
    displayName: document.displayName,
    status: document.status,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  };
}
