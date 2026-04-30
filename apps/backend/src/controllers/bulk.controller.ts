import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { BulkJobSummaryModel } from "../repositories/bulk-job.repository.js";
import { BulkJobRepository } from "../repositories/bulk-job.repository.js";
import { InstanceRepository } from "../repositories/instance.repository.js";
import { BulkJobService } from "../services/bulk-job.service.js";

const sendBulkSchema = z.object({
  instanceId: z.string().min(1),
  numbers: z.array(z.string().min(1)).min(1),
  message: z.string().min(1)
});

const getBulkJobParamsSchema = z.object({
  jobId: z.string().min(1)
});

const instanceRepository = new InstanceRepository();
const bulkJobRepository = new BulkJobRepository();
const bulkJobService = new BulkJobService();

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

function toPublicBulkJobSummary(job: BulkJobSummaryModel) {
  return {
    id: job.id,
    instanceId: job.instanceId,
    message: job.message,
    status: job.status,
    total: job.total,
    sentCount: job.sentCount,
    failedCount: job.failedCount,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    startedAt: job.startedAt?.toISOString(),
    finishedAt: job.finishedAt?.toISOString()
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
    status: job.status,
    total: job.total,
    sentCount: job.sentCount,
    failedCount: job.failedCount,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    startedAt: job.startedAt?.toISOString(),
    finishedAt: job.finishedAt?.toISOString(),
    items: job.items.map((item) => ({
      number: item.number,
      status: item.status,
      error: item.error,
      sentAt: item.sentAt?.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    }))
  };
}

export async function sendBulkController(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.authUser) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const parsed = sendBulkSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
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
    message: parsed.data.message,
    numbers: normalizedNumbers
  });

  bulkJobService.startProcessing({
    jobId: createdJob.id,
    userId: request.authUser.userId
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
