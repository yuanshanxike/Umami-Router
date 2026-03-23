interface QueueItem {
  data: Record<string, unknown>;
  timestamp: number;
  attempts: number;
}

export interface RetryQueueOptions {
  maxSize?: number;
  maxAttempts?: number;
  retryDelay?: number;
  onDrop?: (data: Record<string, unknown>) => void;
}

export class RetryQueue {
  private queue: QueueItem[] = [];
  private maxSize: number;
  private maxAttempts: number;
  private retryDelay: number;
  private processing = false;
  private processFn: (data: Record<string, unknown>) => Promise<void>;
  private onDrop?: (data: Record<string, unknown>) => void;

  constructor(
    processFn: (data: Record<string, unknown>) => Promise<void>,
    options: RetryQueueOptions = {}
  ) {
    this.processFn = processFn;
    this.maxSize = options.maxSize ?? 100;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
    this.onDrop = options.onDrop;
  }

  async add(data: Record<string, unknown>): Promise<void> {
    if (this.queue.length >= this.maxSize) {
      const dropped = this.queue.shift();
      if (dropped && this.onDrop) {
        this.onDrop(dropped.data);
      }
    }

    this.queue.push({
      data,
      timestamp: Date.now(),
      attempts: 0,
    });

    this.process();
  }

  private async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue[0];

      try {
        await this.processFn(item.data);
        this.queue.shift();
      } catch {
        item.attempts++;

        if (item.attempts >= this.maxAttempts) {
          this.queue.shift();
        } else {
          await this.delay(this.retryDelay * item.attempts);
        }
      }
    }

    this.processing = false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  get size(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
  }
}
