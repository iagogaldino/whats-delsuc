import { BulkJobRepository } from "../repositories/bulk-job.repository.js";
import { BulkJobService } from "./bulk-job.service.js";

type BulkSchedulerServiceOptions = {
  pollIntervalMs?: number;
  batchSize?: number;
};

export class BulkSchedulerService {
  private readonly bulkJobRepository = new BulkJobRepository();
  private readonly bulkJobService = new BulkJobService();
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(options?: BulkSchedulerServiceOptions) {
    this.pollIntervalMs = options?.pollIntervalMs ?? 5_000;
    this.batchSize = options?.batchSize ?? 20;
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalMs);
    void this.tick();
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.ticking) {
      return;
    }
    this.ticking = true;
    try {
      const dueJobs = await this.bulkJobRepository.findDueScheduledJobs(new Date(), this.batchSize);
      for (const job of dueJobs) {
        const claimed = await this.bulkJobRepository.claimScheduledJob(job.id);
        if (!claimed) {
          continue;
        }
        await this.bulkJobRepository.markScheduleExecuted(job.id);
        this.bulkJobService.startProcessing({
          jobId: job.id,
          userId: job.userId,
          mediaTempFilePath: job.mediaStoragePath,
          mediaFileName: job.mediaFileName,
          mediaCaption: job.mediaCaption
        });
      }
    } finally {
      this.ticking = false;
    }
  }
}
