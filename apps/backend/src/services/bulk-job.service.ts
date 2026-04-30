import { promises as fs } from "node:fs";
import { BulkJobRepository } from "../repositories/bulk-job.repository.js";
import { InstanceRepository } from "../repositories/instance.repository.js";
import { WhatsappService } from "./whatsapp.service.js";

type StartBulkJobInput = {
  jobId: string;
  userId: string;
  mediaTempFilePath?: string;
  mediaFileName?: string;
  mediaCaption?: string;
};

const bulkJobRepository = new BulkJobRepository();
const instanceRepository = new InstanceRepository();
const whatsappService = new WhatsappService();

export class BulkJobService {
  private runningJobs = new Set<string>();

  startProcessing(input: StartBulkJobInput): void {
    if (this.runningJobs.has(input.jobId)) {
      return;
    }

    this.runningJobs.add(input.jobId);

    void (async () => {
      try {
        await this.process(input);
      } finally {
        this.runningJobs.delete(input.jobId);
      }
    })();
  }

  private async process(input: StartBulkJobInput): Promise<void> {
    const job = await bulkJobRepository.findByIdForUser(input.jobId, input.userId);
    if (!job) {
      return;
    }

    await bulkJobRepository.markProcessing(job.id);

    const instance = await instanceRepository.findByInstanceId(job.instanceId, input.userId);
    if (!instance) {
      for (const item of job.items) {
        await bulkJobRepository.markItemFailed(job.id, item.number, "Instance not found.");
      }
      await bulkJobRepository.markFinished(job.id);
      return;
    }

    try {
      for (const item of job.items) {
        try {
          if (job.deliveryType === "MEDIA") {
            if (!input.mediaTempFilePath || !input.mediaFileName) {
              throw new Error("Media file not available for this job.");
            }
            await whatsappService.sendMedia({
              instanceId: instance.instanceId,
              token: instance.token,
              number: item.number,
              caption: input.mediaCaption ?? job.mediaCaption,
              filePath: input.mediaTempFilePath,
              fileName: input.mediaFileName
            });
          } else {
            await whatsappService.sendText({
              instanceId: instance.instanceId,
              token: instance.token,
              number: item.number,
              text: job.message
            });
          }
          await bulkJobRepository.markItemSent(job.id, item.number);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to send message.";
          await bulkJobRepository.markItemFailed(job.id, item.number, message);
        }
      }
    } finally {
      if (input.mediaTempFilePath) {
        await fs.unlink(input.mediaTempFilePath).catch(() => undefined);
      }
    }

    await bulkJobRepository.markFinished(job.id);
  }
}
