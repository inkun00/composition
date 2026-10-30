type Priority = "backing" | "guide";
type Entry = { buffer: AudioBuffer; bytes: number; priority: Priority };
type Consumer = {
  resolve: (buffer: AudioBuffer) => void;
  reject: (error: unknown) => void;
  detach: () => void;
};
type Job = {
  key: string;
  priority: Priority;
  controller: AbortController;
  consumers: Set<Consumer>;
  finished: boolean;
};

function canceled(): DOMException {
  return new DOMException("반주 준비를 중단했어요.", "AbortError");
}

/** Memory-only prepared audio. A guide never displaces the expensive backing. */
export class KaraokeStemCache {
  private readonly entries = new Map<string, Entry>();
  private readonly jobs = new Map<string, Job>();
  private bytes = 0;

  constructor(private readonly maxBytes = 64 * 1024 * 1024) {
    if (!Number.isFinite(maxBytes) || maxBytes < 0) throw new RangeError("오디오 캐시 크기가 올바르지 않아요.");
  }

  get stats(): Readonly<{ bytes: number; entries: number; pending: number }> {
    return { bytes: this.bytes, entries: this.entries.size, pending: this.jobs.size };
  }

  load(key: string, priority: Priority, render: (signal: AbortSignal) => Promise<AudioBuffer>,
    signal?: AbortSignal): Promise<AudioBuffer> {
    if (signal?.aborted) return Promise.reject(canceled());
    const cached = this.entries.get(key);
    if (cached) {
      if (priority === "backing") cached.priority = priority;
      this.entries.delete(key);
      this.entries.set(key, cached);
      return Promise.resolve(cached.buffer);
    }

    let job = this.jobs.get(key);
    if (!job || job.controller.signal.aborted) {
      job = { key, priority, controller: new AbortController(), consumers: new Set(), finished: false };
      this.jobs.set(key, job);
      const current = job;
      void Promise.resolve().then(() => {
        if (current.controller.signal.aborted) throw canceled();
        return render(current.controller.signal);
      }).then(
        (buffer) => this.finish(current, undefined, buffer),
        (error: unknown) => this.finish(current, error)
      );
    } else if (priority === "backing") job.priority = priority;

    const current = job;
    return new Promise((resolve, reject) => {
      const abort = () => {
        consumer.detach();
        current.consumers.delete(consumer);
        reject(canceled());
        if (!current.consumers.size && !current.finished) this.abort(current);
      };
      const consumer: Consumer = { resolve, reject,
        detach: () => signal?.removeEventListener("abort", abort) };
      current.consumers.add(consumer);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    });
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
    for (const job of [...this.jobs.values()]) this.abort(job);
  }

  private abort(job: Job): void {
    job.finished = true;
    if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
    job.controller.abort();
    for (const consumer of job.consumers) {
      consumer.detach();
      consumer.reject(canceled());
    }
    job.consumers.clear();
  }

  private finish(job: Job, error?: unknown, buffer?: AudioBuffer): void {
    if (job.finished) return;
    job.finished = true;
    if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
    if (buffer && !job.controller.signal.aborted) this.store(job.key, job.priority, buffer);
    for (const consumer of job.consumers) {
      consumer.detach();
      if (buffer && !job.controller.signal.aborted) consumer.resolve(buffer);
      else consumer.reject(error ?? canceled());
    }
    job.consumers.clear();
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.bytes -= entry.bytes;
    this.entries.delete(key);
  }

  private store(key: string, priority: Priority, buffer: AudioBuffer): void {
    const bytes = buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
    if (!Number.isFinite(bytes) || bytes <= 0 || bytes > this.maxBytes) return;
    if (priority === "guide") {
      const backingBytes = [...this.entries.values()].reduce((total, entry) =>
        total + (entry.priority === "backing" ? entry.bytes : 0), 0);
      if (backingBytes + bytes > this.maxBytes) return;
    }
    for (const candidate of ["guide", "backing"] as const) {
      if (candidate === "backing" && priority === "guide") break;
      for (const [oldKey, entry] of this.entries) {
        if (this.bytes + bytes <= this.maxBytes) break;
        if (entry.priority === candidate) this.remove(oldKey);
      }
    }
    this.entries.set(key, { buffer, bytes, priority });
    this.bytes += bytes;
  }
}
