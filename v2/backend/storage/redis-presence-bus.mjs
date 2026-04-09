import Redis from "ioredis";

export class RedisPresenceBus {
  constructor(redisUrl = "") {
    this.redisUrl = String(redisUrl || "").trim();
    this.enabled = Boolean(this.redisUrl);
    this.publisher = null;
    this.subscriber = null;
    this.channel = "synto:v2:presence";
    this.listeners = new Set();
  }

  async init() {
    if (!this.enabled || this.publisher || this.subscriber) {
      return;
    }

    this.publisher = new Redis(this.redisUrl);
    this.subscriber = new Redis(this.redisUrl);

    this.subscriber.on("message", (_channel, rawMessage) => {
      let payload = null;
      try {
        payload = JSON.parse(String(rawMessage || ""));
      } catch {
        payload = null;
      }

      if (!payload || typeof payload !== "object") {
        return;
      }

      for (const listener of this.listeners) {
        try {
          listener(payload);
        } catch {
          // no-op
        }
      }
    });

    await this.subscriber.subscribe(this.channel);
  }

  onEvent(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  async publish(event) {
    if (!this.enabled || !this.publisher) {
      return;
    }

    await this.publisher.publish(this.channel, JSON.stringify(event || {}));
  }

  async close() {
    const tasks = [];
    if (this.subscriber) {
      tasks.push(this.subscriber.quit().catch(() => {}));
    }
    if (this.publisher) {
      tasks.push(this.publisher.quit().catch(() => {}));
    }

    await Promise.all(tasks);
    this.publisher = null;
    this.subscriber = null;
    this.listeners.clear();
  }
}
