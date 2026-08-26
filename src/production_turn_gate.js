export class CoalescingTurnGate {
  constructor({ run, maxReplays = 2, onStart = null, onCoalesce = null, onReplay = null, onDeferred = null } = {}) {
    if (typeof run !== "function") throw new TypeError("CoalescingTurnGate requires a run function");
    this.run = run;
    this.maxReplays = Math.max(0, Number(maxReplays || 0));
    this.onStart = onStart;
    this.onCoalesce = onCoalesce;
    this.onReplay = onReplay;
    this.onDeferred = onDeferred;
    this.active = null;
    this.replayRequested = false;
    this.replayForce = false;
    this.concurrent = 0;
    this.maxConcurrent = 0;
    this.started = 0;
    this.completed = 0;
    this.coalesced = 0;
    this.replays = 0;
    this.deferredAfterReplayCap = 0;
  }

  request(source = "tick", forceSoon = false) {
    if (this.active) {
      this.replayRequested = true;
      this.replayForce = this.replayForce || Boolean(forceSoon);
      this.coalesced += 1;
      this.onCoalesce?.({ source, forceSoon: Boolean(forceSoon) });
      return this.active;
    }

    this.active = this.runCycle(source, Boolean(forceSoon))
      .finally(() => {
        this.active = null;
        this.replayRequested = false;
        this.replayForce = false;
      });
    return this.active;
  }

  async runOne(source, forceSoon) {
    this.started += 1;
    this.concurrent += 1;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.concurrent);
    this.onStart?.({ source, forceSoon, concurrent: this.concurrent });
    try {
      return await this.run(source, forceSoon);
    } finally {
      this.concurrent = Math.max(0, this.concurrent - 1);
      this.completed += 1;
    }
  }

  async runCycle(source, forceSoon) {
    let result = await this.runOne(source, forceSoon);
    let replayCount = 0;

    while (this.replayRequested && replayCount < this.maxReplays) {
      const replayForce = this.replayForce;
      this.replayRequested = false;
      this.replayForce = false;
      replayCount += 1;
      this.replays += 1;
      this.onReplay?.({ replayCount, forceSoon: replayForce });
      result = await this.runOne("replay", replayForce);
    }

    if (this.replayRequested) {
      this.deferredAfterReplayCap += 1;
      this.onDeferred?.({ forceSoon: this.replayForce });
    }
    return result;
  }

  snapshot() {
    return {
      active: Boolean(this.active),
      replayRequested: Boolean(this.replayRequested),
      replayForce: Boolean(this.replayForce),
      concurrent: this.concurrent,
      maxConcurrent: this.maxConcurrent,
      started: this.started,
      completed: this.completed,
      coalesced: this.coalesced,
      replays: this.replays,
      deferredAfterReplayCap: this.deferredAfterReplayCap,
      maxReplays: this.maxReplays
    };
  }
}
