import { ObjectId } from "mongodb";
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
}

type UserDocument = {
  _id: ObjectId;
  name: string;
  email: string;
  password: string;
  waSessionJwt: string;
  waTokenId?: string;
  waApiToken?: string;
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
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  };
}
