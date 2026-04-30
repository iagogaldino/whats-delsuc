import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { z } from "zod";
import type { BulkJobSummaryModel } from "../repositories/bulk-job.repository.js";
import { BulkJobRepository } from "../repositories/bulk-job.repository.js";
import { InstanceRepository } from "../repositories/instance.repository.js";
import { BulkJobService } from "../services/bulk-job.service.js";

const sendBulkSchema = z.object({
  instanceId: z.string().min(1),
  numbers: z.array(z.string().min(1)).min(1),
  message: z.string().optional(),
  caption: z.string().trim().max(200).optional()
});

const getBulkJobParamsSchema = z.object({
  jobId: z.string().min(1)
});

const createBulkScheduleSchema = sendBulkSchema.extend({
  scheduledAt: z.string().min(1)
});

const updateBulkScheduleSchema = z.object({
  scheduledAt: z.string().min(1)
});

const instanceRepository = new InstanceRepository();
const bulkJobRepository = new BulkJobRepository();
const bulkJobService = new BulkJobService();
const MAX_MEDIA_FILE_BYTES = 16 * 1024 * 1024;

function normalizePhoneNumber(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");
  if (digits.length < 10 || digits.length > 15) {
    return null;
  }
  return digits;
}

const listBulkJobsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  instanceId: z.string().min(1).optional()
});

const listBulkSchedulesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50)
});

function toPublicBulkJobSummary(job: BulkJobSummaryModel) {
  return {
    id: job.id,
    instanceId: job.instanceId,
    message: job.message,
    deliveryType: job.deliveryType,
    mediaFileName: job.mediaFileName,
    mediaCaption: job.mediaCaption,
    status: job.status,
    total: job.total,
    sentCount: job.sentCount,
    failedCount: job.failedCount,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    startedAt: job.startedAt?.toISOString(),
    finishedAt: job.finishedAt?.toISOString()
    ,
    scheduledAt: job.scheduledAt?.toISOString(),
    timezone: job.timezone,
    cancelledAt: job.cancelledAt?.toISOString(),
    scheduleUpdatedAt: job.scheduleUpdatedAt?.toISOString(),
    scheduleStatus: job.scheduleStatus
  };
}

function toPublicBulkJob(job: Awaited<ReturnType<BulkJobRepository["findByIdForUser"]>>) {
  if (!job) {
    return null;
  }

  return {
    id: job.id,
    instanceId: job.instanceId,
    message: job.message,
    deliveryType: job.deliveryType,
    mediaFileName: job.mediaFileName,
    mediaCaption: job.mediaCaption,
    status: job.status,
    total: job.total,
    sentCount: job.sentCount,
    failedCount: job.failedCount,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    startedAt: job.startedAt?.toISOString(),
    finishedAt: job.finishedAt?.toISOString(),
    scheduledAt: job.scheduledAt?.toISOString(),
    timezone: job.timezone,
    cancelledAt: job.cancelledAt?.toISOString(),
    scheduleUpdatedAt: job.scheduleUpdatedAt?.toISOString(),
    scheduleStatus: job.scheduleStatus,
    items: job.items.map((item) => ({
      number: item.number,
      status: item.status,
      error: item.error,
      sentAt: item.sentAt?.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    }))
  };
}

type ParsedMultipartBulkPayload = {
  instanceId: string;
  numbers: string[];
  message?: string;
  caption?: string;
  fileName?: string;
  fileBuffer?: Buffer;
  scheduledAt?: string;
};

function parseNumbersField(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item));
  }
  if (typeof raw !== "string") {
    return [];
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item));
    }
  } catch {
    // fallback to plain separators
  }
  return trimmed
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function parseMultipartPayload(request: FastifyRequest): Promise<ParsedMultipartBulkPayload> {
  const payload: ParsedMultipartBulkPayload = {
    instanceId: "",
    numbers: []
  };

  for await (const part of request.parts({ limits: { fileSize: MAX_MEDIA_FILE_BYTES } })) {
    if (part.type === "file") {
      if (part.fieldname !== "file") {
        continue;
      }
      const buffer = await part.toBuffer();
      payload.fileName = part.filename;
      payload.fileBuffer = buffer;
      continue;
    }

    const value = String(part.value ?? "").trim();
    if (part.fieldname === "instanceId") {
      payload.instanceId = value;
      continue;
    }
    if (part.fieldname === "numbers") {
      payload.numbers = parseNumbersField(value);
      continue;
    }
    if (part.fieldname === "message") {
      payload.message = value;
      continue;
    }
    if (part.fieldname === "caption") {
      payload.caption = value;
      continue;
    }
    if (part.fieldname === "scheduledAt") {
      payload.scheduledAt = value;
    }
  }

  return payload;
}

const BRAZIL_TIMEZONE = "BRT";

function parseScheduledAt(raw: string): Date | null {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

export async function sendBulkController(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  let multipartFileBuffer: Buffer | undefined;
  let multipartFileName: string | undefined;

  let rawPayload: unknown;
  try {
    rawPayload = request.isMultipart()
      ? await parseMultipartPayload(request).then((payload) => {
          multipartFileBuffer = payload.fileBuffer;
          multipartFileName = payload.fileName;
          return {
            instanceId: payload.instanceId,
            numbers: payload.numbers,
            message: payload.message,
            caption: payload.caption
          };
        })
      : request.body;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid multipart payload.";
    return reply.status(400).send({ error: message });
  }

  const parsed = sendBulkSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const message = (parsed.data.message ?? "").trim();
  const caption = parsed.data.caption?.trim();
  const hasMedia = Boolean(multipartFileBuffer && multipartFileName);
  if (!hasMedia && message.length === 0) {
    return reply.status(400).send({ error: "message is required when no file is attached." });
  }
  if (hasMedia && multipartFileBuffer && multipartFileBuffer.length > MAX_MEDIA_FILE_BYTES) {
    return reply.status(400).send({ error: "File exceeds max size of 16MB." });
  }

  const instance = await instanceRepository.findByInstanceId(
    parsed.data.instanceId,
    request.authUser.userId
  );

  if (!instance) {
    return reply.status(404).send({ error: "Instance not found" });
  }

  const normalizedNumbers = Array.from(
    new Set(parsed.data.numbers.map((number) => normalizePhoneNumber(number)).filter(Boolean))
  ) as string[];

  if (normalizedNumbers.length === 0) {
    return reply.status(400).send({ error: "No valid numbers provided. Use 10-15 digits per contact." });
  }

  const createdJob = await bulkJobRepository.create({
    userId: request.authUser.userId,
    instanceId: instance.instanceId,
    message: hasMedia ? caption ?? "" : message,
    numbers: normalizedNumbers,
    deliveryType: hasMedia ? "MEDIA" : "TEXT",
    mediaFileName: multipartFileName,
    mediaCaption: caption
  });

  let mediaTempFilePath: string | undefined;
  if (hasMedia && multipartFileBuffer) {
    const extension = extname(multipartFileName ?? "");
    mediaTempFilePath = join(tmpdir(), `bulk-media-${createdJob.id}-${randomUUID()}${extension}`);
    await fs.writeFile(mediaTempFilePath, multipartFileBuffer);
  }

  bulkJobService.startProcessing({
    jobId: createdJob.id,
    userId: request.authUser.userId,
    mediaTempFilePath,
    mediaFileName: multipartFileName,
    mediaCaption: caption
  });

  return reply.status(202).send(toPublicBulkJob(createdJob));
}

export async function listBulkJobsController(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const parsedQuery = listBulkJobsQuerySchema.safeParse(
    request.query && typeof request.query === "object" ? request.query : {}
  );
  if (!parsedQuery.success) {
    return reply.status(400).send({ error: "Invalid query", details: parsedQuery.error.flatten() });
  }

  const summaries = await bulkJobRepository.listSummariesByUserId(request.authUser.userId, {
    limit: parsedQuery.data.limit,
    instanceId: parsedQuery.data.instanceId
  });

  return reply.status(200).send({ items: summaries.map(toPublicBulkJobSummary) });
}

export async function createBulkScheduleController(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  let multipartFileBuffer: Buffer | undefined;
  let multipartFileName: string | undefined;
  let rawPayload: unknown;
  try {
    rawPayload = request.isMultipart()
      ? await parseMultipartPayload(request).then((payload) => {
          multipartFileBuffer = payload.fileBuffer;
          multipartFileName = payload.fileName;
          return {
            instanceId: payload.instanceId,
            numbers: payload.numbers,
            message: payload.message,
            caption: payload.caption,
            scheduledAt: payload.scheduledAt
          };
        })
      : request.body;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid multipart payload.";
    return reply.status(400).send({ error: message });
  }

  const parsed = createBulkScheduleSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const scheduledAt = parseScheduledAt(parsed.data.scheduledAt);
  if (!scheduledAt) {
    return reply.status(400).send({ error: "Invalid scheduledAt." });
  }
  if (scheduledAt.getTime() <= Date.now()) {
    return reply.status(400).send({ error: "scheduledAt must be a future date/time." });
  }

  const instance = await instanceRepository.findByInstanceId(
    parsed.data.instanceId,
    request.authUser.userId
  );
  if (!instance) {
    return reply.status(404).send({ error: "Instance not found" });
  }

  const message = (parsed.data.message ?? "").trim();
  const caption = parsed.data.caption?.trim();
  const hasMedia = Boolean(multipartFileBuffer && multipartFileName);
  if (!hasMedia && message.length === 0) {
    return reply.status(400).send({ error: "message is required when no file is attached." });
  }

  const normalizedNumbers = Array.from(
    new Set(parsed.data.numbers.map((number) => normalizePhoneNumber(number)).filter(Boolean))
  ) as string[];
  if (normalizedNumbers.length === 0) {
    return reply.status(400).send({ error: "No valid numbers provided. Use 10-15 digits per contact." });
  }

  let mediaStoragePath: string | undefined;
  if (hasMedia && multipartFileBuffer && multipartFileName) {
    const extension = extname(multipartFileName ?? "");
    const storageDir = join(tmpdir(), "whatsdelsuc-bulk-scheduled-media");
    await fs.mkdir(storageDir, { recursive: true });
    mediaStoragePath = join(storageDir, `bulk-media-${randomUUID()}${extension}`);
    await fs.writeFile(mediaStoragePath, multipartFileBuffer);
  }

  const createdJob = await bulkJobRepository.createScheduled({
    userId: request.authUser.userId,
    instanceId: instance.instanceId,
    message: hasMedia ? caption ?? "" : message,
    numbers: normalizedNumbers,
    deliveryType: hasMedia ? "MEDIA" : "TEXT",
    mediaFileName: multipartFileName,
    mediaCaption: caption,
    mediaStoragePath,
    scheduledAt,
    timezone: BRAZIL_TIMEZONE
  });

  return reply.status(201).send(toPublicBulkJob(createdJob));
}

export async function listBulkSchedulesController(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
  const parsedQuery = listBulkSchedulesQuerySchema.safeParse(
    request.query && typeof request.query === "object" ? request.query : {}
  );
  if (!parsedQuery.success) {
    return reply.status(400).send({ error: "Invalid query", details: parsedQuery.error.flatten() });
  }
  const items = await bulkJobRepository.listScheduledByUserId(request.authUser.userId, {
    limit: parsedQuery.data.limit
  });
  return reply.status(200).send({ items: items.map(toPublicBulkJobSummary) });
}

export async function updateBulkScheduleController(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
  const parsedParams = getBulkJobParamsSchema.safeParse(request.params);
  if (!parsedParams.success) {
    return reply.status(400).send({ error: "Invalid params" });
  }
  const parsedBody = updateBulkScheduleSchema.safeParse(request.body);
  if (!parsedBody.success) {
    return reply.status(400).send({ error: "Invalid payload", details: parsedBody.error.flatten() });
  }
  const scheduledAt = parseScheduledAt(parsedBody.data.scheduledAt);
  if (!scheduledAt) {
    return reply.status(400).send({ error: "Invalid scheduledAt." });
  }
  if (scheduledAt.getTime() <= Date.now()) {
    return reply.status(400).send({ error: "scheduledAt must be a future date/time." });
  }
  const updated = await bulkJobRepository.updateScheduleTime(
    parsedParams.data.jobId,
    request.authUser.userId,
    scheduledAt,
    BRAZIL_TIMEZONE
  );
  if (!updated) {
    return reply.status(409).send({ error: "Schedule not found or can no longer be edited." });
  }
  return reply.status(200).send(toPublicBulkJob(updated));
}

export async function cancelBulkScheduleController(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
  const parsedParams = getBulkJobParamsSchema.safeParse(request.params);
  if (!parsedParams.success) {
    return reply.status(400).send({ error: "Invalid params" });
  }
  const cancelled = await bulkJobRepository.cancelScheduled(
    parsedParams.data.jobId,
    request.authUser.userId
  );
  if (!cancelled) {
    return reply.status(409).send({ error: "Schedule not found or can no longer be cancelled." });
  }
  return reply.status(200).send(toPublicBulkJob(cancelled));
}

export async function getBulkJobController(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const parsedParams = getBulkJobParamsSchema.safeParse(request.params);
  if (!parsedParams.success) {
    return reply.status(400).send({ error: "Invalid params" });
  }

  const job = await bulkJobRepository.findByIdForUser(parsedParams.data.jobId, request.authUser.userId);
  if (!job) {
    return reply.status(404).send({ error: "Bulk job not found" });
  }

  return reply.status(200).send(toPublicBulkJob(job));
}
