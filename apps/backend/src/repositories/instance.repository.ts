import { ObjectId } from "mongodb";
import { getMongoDb } from "../lib/mongo.js";

type CreateInstanceInput = {
  userId: string;
  instanceId: string;
  token: string;
  displayName?: string;
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
}

type WhatsappInstanceDocument = {
  _id: ObjectId;
  userId: string;
  instanceId: string;
  token: string;
  systemPrompt: string;
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
    displayName: document.displayName,
    status: document.status,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  };
}
