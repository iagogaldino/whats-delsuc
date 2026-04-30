import { ObjectId } from "mongodb";
import { getMongoDb } from "../lib/mongo.js";

type CreateTemplateInput = {
  userId: string;
  name: string;
  content: string;
  media?: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    dataBase64: string;
  };
};

type UpdateTemplateInput = {
  templateId: string;
  userId: string;
  name: string;
  content: string;
  media?: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    dataBase64: string;
  };
};

const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function extractPlaceholders(content: string): string[] {
  const found = new Set<string>();
  for (const match of content.matchAll(PLACEHOLDER_REGEX)) {
    const key = match[1]?.trim().toLowerCase();
    if (key) {
      found.add(key);
    }
  }
  return Array.from(found.values()).sort();
}

export class MessageTemplateRepository {
  async listByUserId(userId: string): Promise<MessageTemplateModel[]> {
    const docs = await getMongoDb()
      .collection<MessageTemplateDocument>("message_templates")
      .find({ userId })
      .sort({ updatedAt: -1 })
      .toArray();

    return docs.map(mapTemplateDocument);
  }

  async create(input: CreateTemplateInput): Promise<MessageTemplateModel> {
    const now = new Date();
    const placeholders = extractPlaceholders(input.content);
    const result = await getMongoDb()
      .collection<MessageTemplateDocument>("message_templates")
      .insertOne({
        userId: input.userId,
        name: input.name,
        content: input.content,
        media: input.media,
        placeholders,
        createdAt: now,
        updatedAt: now
      } as MessageTemplateInsertDocument);

    const created = await getMongoDb()
      .collection<MessageTemplateDocument>("message_templates")
      .findOne({ _id: result.insertedId });

    if (!created) {
      throw new Error("Failed to load created template.");
    }

    return mapTemplateDocument(created);
  }

  async update(input: UpdateTemplateInput): Promise<MessageTemplateModel | null> {
    if (!ObjectId.isValid(input.templateId)) {
      return null;
    }

    const placeholders = extractPlaceholders(input.content);
    const updated = await getMongoDb()
      .collection<MessageTemplateDocument>("message_templates")
      .findOneAndUpdate(
        { _id: new ObjectId(input.templateId), userId: input.userId },
        {
          $set: {
            name: input.name,
            content: input.content,
            media: input.media,
            placeholders,
            updatedAt: new Date()
          }
        },
        { returnDocument: "after" }
      );

    return updated ? mapTemplateDocument(updated) : null;
  }

  async delete(templateId: string, userId: string): Promise<boolean> {
    if (!ObjectId.isValid(templateId)) {
      return false;
    }

    const result = await getMongoDb()
      .collection<MessageTemplateDocument>("message_templates")
      .deleteOne({ _id: new ObjectId(templateId), userId });

    return result.deletedCount > 0;
  }

  async findByIdForUser(templateId: string, userId: string): Promise<MessageTemplateModel | null> {
    if (!ObjectId.isValid(templateId)) {
      return null;
    }

    const doc = await getMongoDb()
      .collection<MessageTemplateDocument>("message_templates")
      .findOne({ _id: new ObjectId(templateId), userId });

    return doc ? mapTemplateDocument(doc) : null;
  }
}

type MessageTemplateDocument = {
  _id?: ObjectId;
  userId: string;
  name: string;
  content: string;
  media?: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    dataBase64: string;
  };
  placeholders: string[];
  createdAt: Date;
  updatedAt: Date;
};

type MessageTemplateInsertDocument = {
  userId: string;
  name: string;
  content: string;
  media?: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    dataBase64: string;
  };
  placeholders: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type MessageTemplateModel = {
  id: string;
  userId: string;
  name: string;
  content: string;
  media?: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    dataBase64: string;
  };
  placeholders: string[];
  createdAt: Date;
  updatedAt: Date;
};

function mapTemplateDocument(document: MessageTemplateDocument): MessageTemplateModel {
  if (!document._id) {
    throw new Error("Template document is missing _id.");
  }

  return {
    id: document._id.toHexString(),
    userId: document.userId,
    name: document.name,
    content: document.content,
    media: document.media,
    placeholders: document.placeholders ?? [],
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  };
}

