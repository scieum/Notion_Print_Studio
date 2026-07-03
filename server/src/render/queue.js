/**
 * 인메모리 렌더 큐 (불변 제약 C7 — Puppeteer 동시성 상한, 초과분 대기).
 */
export class RenderQueue {
  constructor(concurrency) {
    this.concurrency = concurrency;
    this.running = 0;
    this.waiting = [];
  }

  add(task) {
    return new Promise((resolve, reject) => {
      this.waiting.push({ task, resolve, reject });
      this.#drain();
    });
  }

  #drain() {
    while (this.running < this.concurrency && this.waiting.length > 0) {
      const { task, resolve, reject } = this.waiting.shift();
      this.running++;
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          this.running--;
          this.#drain();
        });
    }
  }
}
