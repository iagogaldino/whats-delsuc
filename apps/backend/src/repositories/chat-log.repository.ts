import { getMongoDb } from "../lib/mongo.js";

type CreateChatLogInput = {
  whatsappInstanceId: string;
  customerNumber: string;
  direction: "INBOUND" | "OUTBOUND";
  message: string;
  modelUsed?: string;
};

export class ChatLogRepository {
  async create(input: CreateChatLogInput): Promise<void> {
    await getMongoDb().collection("chat_logs").insertOne({
      whatsappInstanceId: input.whatsappInstanceId,
      customerNumber: input.customerNumber,
      direction: input.direction,
      message: input.message,
      modelUsed: input.modelUsed,
      createdAt: new Date()
    });
  }
}
