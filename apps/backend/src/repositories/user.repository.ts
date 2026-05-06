import { ObjectId, type UpdateFilter } from "mongodb";
import { getMongoDb } from "../lib/mongo.js";
import { normalizeEmail } from "../lib/normalize-email.js";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  waSessionJwt: string;
  waTokenId: string;
  waApiToken: string;
};

type UpdateWhatsAppTokenInput = {
  userId: string;
  waTokenId: string;
  waApiToken: string;
};

export type UserMcpServer = {
  id: string;
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
};

export class UserRepository {
  async findByEmail(email: string): Promise<UserModel | null> {
    const norm = normalizeEmail(email);
    const collection = getMongoDb().collection("users");
    let user = (await collection.findOne({ email: norm })) as UserDocument | null;
    if (!user) {
      user = (await collection.findOne({
        email: { $regex: new RegExp(`^${escapeRegex(norm)}$`, "i") }
      })) as UserDocument | null;
    }
    return user ? mapUserDocument(user) : null;
  }

  async findById(id: string): Promise<UserModel | null> {
    if (!ObjectId.isValid(id)) {
      return null;
    }

    const user = (await getMongoDb()
      .collection("users")
      .findOne({ _id: new ObjectId(id) })) as UserDocument | null;

    return user ? mapUserDocument(user) : null;
  }

  async create(input: CreateUserInput): Promise<UserModel> {
    const now = new Date();
    const collection = getMongoDb().collection("users");
    const created = await collection.insertOne({
      ...input,
      createdAt: now,
      updatedAt: now
    });

    const user = (await collection.findOne({ _id: created.insertedId })) as UserDocument | null;
    if (!user) {
      throw new Error("Failed to load created user.");
    }

    return mapUserDocument(user);
  }

  async updateOpenAiApiKey(userId: string, openaiApiKey: string | undefined): Promise<UserModel | null> {
    if (!ObjectId.isValid(userId)) {
      throw new Error("Invalid user id");
    }

    const filter = { _id: new ObjectId(userId) };
    const coll = getMongoDb().collection<UserDocument>("users");
    const update: UpdateFilter<UserDocument> =
      openaiApiKey === undefined
        ? { $unset: { openaiApiKey: 1 }, $set: { updatedAt: new Date() } }
        : { $set: { openaiApiKey, updatedAt: new Date() } };

    const outcome = await coll.updateOne(filter, update);
    if (outcome.matchedCount === 0) {
      return null;
    }
    return this.findById(userId);
  }

  async updateWhatsAppToken(input: UpdateWhatsAppTokenInput): Promise<void> {
    if (!ObjectId.isValid(input.userId)) {
      throw new Error("Invalid user id");
    }

    await getMongoDb()
      .collection("users")
      .updateOne(
        { _id: new ObjectId(input.userId) },
        {
          $set: {
        waTokenId: input.waTokenId,
            waApiToken: input.waApiToken,
            updatedAt: new Date()
          }
        }
      );
  }

  async updateMcpServers(userId: string, mcpServers: UserMcpServer[]): Promise<UserModel | null> {
    if (!ObjectId.isValid(userId)) {
      throw new Error("Invalid user id");
    }

    const outcome = await getMongoDb()
      .collection<UserDocument>("users")
      .updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: {
            mcpServers,
            updatedAt: new Date()
          }
        }
      );

    if (outcome.matchedCount === 0) {
      return null;
    }
    return this.findById(userId);
  }
}

type UserDocument = {
  _id: ObjectId;
  name: string;
  email: string;
  password: string;
  waSessionJwt: string;
  waTokenId?: string;
  waApiToken?: string;
  openaiApiKey?: string;
  mcpServers?: UserMcpServer[];
  createdAt: Date;
  updatedAt: Date;
};

export type UserModel = {
  id: string;
  name: string;
  email: string;
  password: string;
  waSessionJwt: string;
  waTokenId?: string;
  waApiToken?: string;
  openaiApiKey?: string;
  mcpServers: UserMcpServer[];
  createdAt: Date;
  updatedAt: Date;
};

function mapUserDocument(document: UserDocument): UserModel {
  return {
    id: document._id.toHexString(),
    name: document.name,
    email: document.email,
    password: document.password,
    waSessionJwt: document.waSessionJwt,
    waTokenId: document.waTokenId,
    waApiToken: document.waApiToken,
    openaiApiKey: document.openaiApiKey,
    mcpServers: document.mcpServers ?? [],
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  };
}
