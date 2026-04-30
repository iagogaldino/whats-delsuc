import { ObjectId } from "mongodb";
import { getMongoDb } from "../lib/mongo.js";

export type BulkMessageStatus = "PENDING" | "SENT" | "FAILED";
export type BulkJobStatus =
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "COMPLETED_WITH_ERRORS"
  | "FAILED";
export type BulkScheduleStatus = "SCHEDULED" | "RUNNING" | "EXECUTED" | "CANCELLED";

type CreateBulkJobInput = {
  userId: string;
  instanceId: string;
  message: string;
  numbers: string[];
  deliveryType?: "TEXT" | "MEDIA";
  mediaFileName?: string;
  mediaCaption?: string;
  mediaStoragePath?: string;
};

type CreateScheduledBulkJobInput = {
  userId: string;
  instanceId: string;
  message: string;
  numbers: string[];
  deliveryType?: "TEXT" | "MEDIA";
  mediaFileName?: string;
  mediaCaption?: string;
  mediaStoragePath?: string;
  scheduledAt: Date;
  timezone: "BRT";
};

type BulkMessageItemDocument = {
  number: string;
  status: BulkMessageStatus;
  error?: string;
  sentAt?: Date;
  updatedAt: Date;
};

type BulkJobDocument = {
  _id?: ObjectId;
  userId: string;
  instanceId: string;
  message: string;
  deliveryType?: "TEXT" | "MEDIA";
  mediaFileName?: string;
  mediaCaption?: string;
  mediaStoragePath?: string;
  status: BulkJobStatus;
  total: number;
  sentCount: number;
  failedCount: number;
  items: BulkMessageItemDocument[];
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  scheduledAt?: Date;
  timezone?: "BRT";
  cancelledAt?: Date;
  scheduleUpdatedAt?: Date;
  scheduleStatus?: BulkScheduleStatus;
};

export type BulkMessageItemModel = {
  number: string;
  status: BulkMessageStatus;
  error?: string;
  sentAt?: Date;
  updatedAt: Date;
};

export type BulkJobModel = {
  id: string;
  userId: string;
  instanceId: string;
  message: string;
  deliveryType: "TEXT" | "MEDIA";
  mediaFileName?: string;
  mediaCaption?: string;
  mediaStoragePath?: string;
  status: BulkJobStatus;
  total: number;
  sentCount: number;
  failedCount: number;
  items: BulkMessageItemModel[];
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  scheduledAt?: Date;
  timezone?: "BRT";
  cancelledAt?: Date;
  scheduleUpdatedAt?: Date;
  scheduleStatus?: BulkScheduleStatus;
};

/** Job row without per-number items (lighter list/history responses). */
export type BulkJobSummaryModel = Omit<BulkJobModel, "items">;

export class BulkJobRepository {
  async create(input: CreateBulkJobInput): Promise<BulkJobModel> {
    const now = new Date();
    const items: BulkMessageItemDocument[] = input.numbers.map((number) => ({
      number,
      status: "PENDING",
      updatedAt: now
    }));

    const collection = getMongoDb().collection<BulkJobDocument>("bulk_jobs");
    const result = await collection.insertOne({
      userId: input.userId,
      instanceId: input.instanceId,
      message: input.message,
      deliveryType: input.deliveryType ?? "TEXT",
      mediaFileName: input.mediaFileName,
      mediaCaption: input.mediaCaption,
      mediaStoragePath: input.mediaStoragePath,
      status: "QUEUED",
      total: input.numbers.length,
      sentCount: 0,
      failedCount: 0,
      items,
      createdAt: now,
      updatedAt: now
    });

    const created = await collection.findOne({ _id: result.insertedId });
    if (!created) {
      throw new Error("Failed to create bulk job.");
    }

    return mapBulkJobDocument(created);
  }

  async createScheduled(input: CreateScheduledBulkJobInput): Promise<BulkJobModel> {
    const now = new Date();
    const items: BulkMessageItemDocument[] = input.numbers.map((number) => ({
      number,
      status: "PENDING",
      updatedAt: now
    }));

    const collection = getMongoDb().collection<BulkJobDocument>("bulk_jobs");
    const result = await collection.insertOne({
      userId: input.userId,
      instanceId: input.instanceId,
      message: input.message,
      deliveryType: input.deliveryType ?? "TEXT",
      mediaFileName: input.mediaFileName,
      mediaCaption: input.mediaCaption,
      mediaStoragePath: input.mediaStoragePath,
      status: "QUEUED",
      total: input.numbers.length,
      sentCount: 0,
      failedCount: 0,
      items,
      createdAt: now,
      updatedAt: now,
      scheduledAt: input.scheduledAt,
      timezone: input.timezone,
      scheduleUpdatedAt: now,
      scheduleStatus: "SCHEDULED"
    });

    const created = await collection.findOne({ _id: result.insertedId });
    if (!created) {
      throw new Error("Failed to create scheduled bulk job.");
    }

    return mapBulkJobDocument(created);
  }

  async listSummariesByUserId(
    userId: string,
    options: { limit: number; instanceId?: string }
  ): Promise<BulkJobSummaryModel[]> {
    const limit = Math.min(Math.max(options.limit, 1), 100);
    const filter: Record<string, string> = { userId };
    if (options.instanceId !== undefined && options.instanceId.length > 0) {
      filter.instanceId = options.instanceId;
    }

    const documents = await getMongoDb()
      .collection<BulkJobDocument>("bulk_jobs")
      .find(filter)
      .project<BulkJobDocument>({ items: 0 })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return documents.map((document) => mapBulkJobSummary(document));
  }

  async findByIdForUser(jobId: string, userId: string): Promise<BulkJobModel | null> {
    const objectId = toObjectId(jobId);
    if (!objectId) {
      return null;
    }

    const document = await getMongoDb()
      .collection<BulkJobDocument>("bulk_jobs")
      .findOne({ _id: objectId, userId });

    return document ? mapBulkJobDocument(document) : null;
  }

  async listScheduledByUserId(userId: string, options: { limit: number }): Promise<BulkJobSummaryModel[]> {
    const limit = Math.min(Math.max(options.limit, 1), 100);
    const documents = await getMongoDb()
      .collection<BulkJobDocument>("bulk_jobs")
      .find({ userId, scheduledAt: { $exists: true } })
      .project<BulkJobDocument>({ items: 0 })
      .sort({ scheduledAt: 1, createdAt: -1 })
      .limit(limit)
      .toArray();

    return documents.map((document) => mapBulkJobSummary(document));
  }

  async findDueScheduledJobs(now: Date, limit: number): Promise<BulkJobModel[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const documents = await getMongoDb()
      .collection<BulkJobDocument>("bulk_jobs")
      .find({
        scheduleStatus: "SCHEDULED",
        scheduledAt: { $lte: now }
      })
      .sort({ scheduledAt: 1 })
      .limit(safeLimit)
      .toArray();

    return documents.map((document) => mapBulkJobDocument(document));
  }

  async claimScheduledJob(jobId: string): Promise<boolean> {
    const objectId = toObjectId(jobId);
    if (!objectId) {
      return false;
    }
    const now = new Date();
    const result = await getMongoDb()
      .collection<BulkJobDocument>("bulk_jobs")
      .updateOne(
        { _id: objectId, scheduleStatus: "SCHEDULED" },
        { $set: { scheduleStatus: "RUNNING", scheduleUpdatedAt: now, updatedAt: now } }
      );
    return result.modifiedCount === 1;
  }

  async markScheduleExecuted(jobId: string): Promise<void> {
    const objectId = toObjectId(jobId);
    if (!objectId) {
      return;
    }
    const now = new Date();
    await getMongoDb()
      .collection<BulkJobDocument>("bulk_jobs")
      .updateOne(
        { _id: objectId },
        { $set: { scheduleStatus: "EXECUTED", scheduleUpdatedAt: now, updatedAt: now } }
      );
  }

  async updateScheduleTime(
    jobId: string,
    userId: string,
    scheduledAt: Date,
    timezone: "BRT"
  ): Promise<BulkJobModel | null> {
    const objectId = toObjectId(jobId);
    if (!objectId) {
      return null;
    }
    const now = new Date();
    const result = await getMongoDb()
      .collection<BulkJobDocument>("bulk_jobs")
      .findOneAndUpdate(
        { _id: objectId, userId, scheduleStatus: "SCHEDULED" },
        { $set: { scheduledAt, timezone, scheduleUpdatedAt: now, updatedAt: now } },
        { returnDocument: "after" }
      );
    return result ? mapBulkJobDocument(result) : null;
  }

  async cancelScheduled(jobId: string, userId: string): Promise<BulkJobModel | null> {
    const objectId = toObjectId(jobId);
    if (!objectId) {
      return null;
    }
    const now = new Date();
    const result = await getMongoDb()
      .collection<BulkJobDocument>("bulk_jobs")
      .findOneAndUpdate(
        { _id: objectId, userId, scheduleStatus: "SCHEDULED" },
        {
          $set: {
            scheduleStatus: "CANCELLED",
            cancelledAt: now,
            scheduleUpdatedAt: now,
            updatedAt: now
          }
        },
        { returnDocument: "after" }
      );
    return result ? mapBulkJobDocument(result) : null;
  }

  async markProcessing(jobId: string): Promise<void> {
    const objectId = toObjectId(jobId);
    if (!objectId) {
      return;
    }

    const now = new Date();
    await getMongoDb()
      .collection<BulkJobDocument>("bulk_jobs")
      .updateOne(
        { _id: objectId },
        { $set: { status: "PROCESSING", startedAt: now, updatedAt: now } }
      );
  }

  async markItemSent(jobId: string, number: string): Promise<void> {
    await this.updateItemResult(jobId, number, "SENT");
  }

  async markItemFailed(jobId: string, number: string, error: string): Promise<void> {
    await this.updateItemResult(jobId, number, "FAILED", error);
  }

  private async updateItemResult(
    jobId: string,
    number: string,
    status: BulkMessageStatus,
    error?: string
  ): Promise<void> {
    const objectId = toObjectId(jobId);
    if (!objectId) {
      return;
    }

    const now = new Date();
    const setPayload: Record<string, unknown> = {
      "items.$.status": status,
      "items.$.updatedAt": now,
      updatedAt: now
    };
    if (status === "SENT") {
      setPayload["items.$.sentAt"] = now;
      setPayload["items.$.error"] = undefined;
    } else {
      setPayload["items.$.error"] = error;
    }

    await getMongoDb()
      .collection<BulkJobDocument>("bulk_jobs")
      .updateOne({ _id: objectId, "items.number": number }, { $set: setPayload });
  }

  async markFinished(jobId: string): Promise<void> {
    const objectId = toObjectId(jobId);
    if (!objectId) {
      return;
    }

    const collection = getMongoDb().collection<BulkJobDocument>("bulk_jobs");
    const job = await collection.findOne({ _id: objectId });
    if (!job) {
      return;
    }

    const sentCount = job.items.filter((item) => item.status === "SENT").length;
    const failedCount = job.items.filter((item) => item.status === "FAILED").length;
    const status: BulkJobStatus =
      failedCount === 0
        ? "COMPLETED"
        : sentCount > 0
          ? "COMPLETED_WITH_ERRORS"
          : "FAILED";
    const now = new Date();

    await collection.updateOne(
      { _id: objectId },
      {
        $set: {
          status,
          sentCount,
          failedCount,
          finishedAt: now,
          updatedAt: now
        }
      }
    );
  }
}

function toObjectId(id: string): ObjectId | null {
  if (!ObjectId.isValid(id)) {
    return null;
  }
  return new ObjectId(id);
}

function mapBulkJobSummary(document: BulkJobDocument): BulkJobSummaryModel {
  if (!document._id) {
    throw new Error("Bulk job document missing _id.");
  }

  return {
    id: document._id.toHexString(),
    userId: document.userId,
    instanceId: document.instanceId,
    message: document.message,
    deliveryType: document.deliveryType ?? "TEXT",
    mediaFileName: document.mediaFileName,
    mediaCaption: document.mediaCaption,
    mediaStoragePath: document.mediaStoragePath,
    status: document.status,
    total: document.total,
    sentCount: document.sentCount,
    failedCount: document.failedCount,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    startedAt: document.startedAt,
    finishedAt: document.finishedAt,
    scheduledAt: document.scheduledAt,
    timezone: document.timezone,
    cancelledAt: document.cancelledAt,
    scheduleUpdatedAt: document.scheduleUpdatedAt,
    scheduleStatus: document.scheduleStatus
  };
}

function mapBulkJobDocument(document: BulkJobDocument): BulkJobModel {
  if (!document._id) {
    throw new Error("Bulk job document missing _id.");
  }

  return {
    id: document._id.toHexString(),
    userId: document.userId,
    instanceId: document.instanceId,
    message: document.message,
    deliveryType: document.deliveryType ?? "TEXT",
    mediaFileName: document.mediaFileName,
    mediaCaption: document.mediaCaption,
    mediaStoragePath: document.mediaStoragePath,
    status: document.status,
    total: document.total,
    sentCount: document.sentCount,
    failedCount: document.failedCount,
    items: document.items.map((item) => ({
      number: item.number,
      status: item.status,
      error: item.error,
      sentAt: item.sentAt,
      updatedAt: item.updatedAt
    })),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    startedAt: document.startedAt,
    finishedAt: document.finishedAt,
    scheduledAt: document.scheduledAt,
    timezone: document.timezone,
    cancelledAt: document.cancelledAt,
    scheduleUpdatedAt: document.scheduleUpdatedAt,
    scheduleStatus: document.scheduleStatus
  };
}
