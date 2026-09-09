export const V41_HISTORY_LIMIT = 220;

export class CoalescingHistoryWriter {
  constructor({ read, assign, write, limit = V41_HISTORY_LIMIT } = {}) {
    if (typeof read !== "function") throw new TypeError("CoalescingHistoryWriter requires read()");
    if (typeof assign !== "function") throw new TypeError("CoalescingHistoryWriter requires assign()");
    if (typeof write !== "function") throw new TypeError("CoalescingHistoryWriter requires write()");
    this.read = read;
    this.assign = assign;
    this.write = write;
    this.limit = Math.max(1, Number(limit || V41_HISTORY_LIMIT));
    this.active = null;
    this.dirty = false;
    this.concurrent = 0;
    this.stats = {
      requests: 0,
      coalescedRequests: 0,
      cyclesStarted: 0,
      cyclesCompleted: 0,
      writesStarted: 0,
      writesCompleted: 0,
      writeFailures: 0,
      maxConcurrent: 0
    };
  }

  request() {
    this.stats.requests += 1;
    this.dirty = true;

    if (this.active) {
      this.stats.coalescedRequests += 1;
      return this.active;
    }

    // Defer the flush by one microtask so synchronous message bursts collapse
    // before the first storage snapshot, while marking the cycle active now.
    const cycle = Promise.resolve().then(() => this.flushCycle());
    this.active = cycle.finally(() => {
      this.active = null;
    });
    return this.active;
  }

  async flushCycle() {
    this.stats.cyclesStarted += 1;
    this.concurrent += 1;
    this.stats.maxConcurrent = Math.max(this.stats.maxConcurrent, this.concurrent);

    try {
      do {
        this.dirty = false;
        const current = this.read();
        const snapshot = (Array.isArray(current) ? current : []).slice(-this.limit);
        this.assign(snapshot);

        this.stats.writesStarted += 1;
        await this.write(snapshot);
        this.stats.writesCompleted += 1;
      } while (this.dirty);
    } catch (error) {
      this.stats.writeFailures += 1;
      throw error;
    } finally {
      this.concurrent = Math.max(0, this.concurrent - 1);
      this.stats.cyclesCompleted += 1;
    }
  }

  snapshot() {
    return {
      ...this.stats,
      active: Boolean(this.active),
      dirty: Boolean(this.dirty),
      concurrent: this.concurrent,
      historyLimit: this.limit
    };
  }
}
