import type { Client, Connection, JsonValue, ReconnectOptions } from "./types.js";

interface RawConnector {
  connect(): Promise<Connection>;
}

const DEFAULT_RECONNECT: Required<Omit<ReconnectOptions, "enabled">> = {
  maxAttempts: Infinity,
  initialDelayMs: 500,
  maxDelayMs: 30_000,
  backoffFactor: 2,
  jitter: true,
};

function computeDelay(
  attempt: number,
  opts: Required<Omit<ReconnectOptions, "enabled">>
): number {
  const base = opts.initialDelayMs * Math.pow(opts.backoffFactor, attempt - 1);
  const clamped = Math.min(base, opts.maxDelayMs);
  return opts.jitter ? clamped * (0.5 + Math.random() * 0.5) : clamped;
}

export class ReconnectingClient implements Client {
  private conn: Connection | null = null;
  private manualClose = false;
  private reconnecting = false;

  private onMessageCb?: (msg: JsonValue) => void;
  private onCloseCb?: () => void;
  private onErrorCb?: (err: Error) => void;
  private onReconnectingCb?: (attempt: number, delayMs: number) => void;
  private onReconnectedCb?: () => void;

  private queue: JsonValue[] = [];
  private readonly maxQueueSize: number;
  private readonly queueEnabled: boolean;
  private readonly reconnectOpts: ReconnectOptions | undefined;

  constructor(
    private connector: RawConnector,
    opts: { reconnect?: ReconnectOptions; queueWhileDisconnected?: boolean; maxQueueSize?: number }
  ) {
    this.reconnectOpts = opts.reconnect;
    this.queueEnabled = opts.queueWhileDisconnected ?? false;
    this.maxQueueSize = opts.maxQueueSize ?? 1000;
  }

  private bindConn(conn: Connection): void {
    this.conn = conn;

    conn.onMessage((msg) => this.onMessageCb?.(msg));
    conn.onError((err) => this.onErrorCb?.(err));
    conn.onClose(() => {
      if (this.manualClose) {
        this.onCloseCb?.();
        return;
      }
      if (this.reconnectOpts?.enabled) {
        void this.runReconnectLoop();
      } else {
        this.onCloseCb?.();
      }
    });
  }

  private async runReconnectLoop(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;
    this.conn = null;

    const opts = { ...DEFAULT_RECONNECT, ...this.reconnectOpts };
    const maxAttempts = opts.maxAttempts ?? Infinity;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const delayMs = computeDelay(attempt, opts);
      this.onReconnectingCb?.(attempt, delayMs);
      await new Promise((r) => setTimeout(r, delayMs));

      if (this.manualClose) break;

      try {
        const conn = await this.connector.connect();
        this.reconnecting = false;
        this.bindConn(conn);
        this.onReconnectedCb?.();
        await this.flushQueue();
        return;
      } catch {
        // try next attempt
      }
    }

    this.reconnecting = false;
    this.onCloseCb?.();
  }

  private async flushQueue(): Promise<void> {
    const pending = this.queue.splice(0);
    for (const msg of pending) {
      try {
        await this.send(msg);
      } catch {
        // discard if send fails mid-flush
      }
    }
  }

  async connect(): Promise<void> {
    const conn = await this.connector.connect();
    this.bindConn(conn);
  }

  onMessage(cb: (msg: JsonValue) => void): void {
    this.onMessageCb = cb;
  }

  onClose(cb: () => void): void {
    this.onCloseCb = cb;
  }

  onError(cb: (err: Error) => void): void {
    this.onErrorCb = cb;
  }

  onReconnecting(cb: (attempt: number, delayMs: number) => void): void {
    this.onReconnectingCb = cb;
  }

  onReconnected(cb: () => void): void {
    this.onReconnectedCb = cb;
  }

  send(message: JsonValue): Promise<void> {
    if (this.conn) return this.conn.send(message);

    if (this.queueEnabled) {
      if (this.queue.length >= this.maxQueueSize) {
        return Promise.reject(new Error("Outbound queue is full"));
      }
      this.queue.push(message);
      return Promise.resolve();
    }

    return Promise.reject(new Error("Not connected"));
  }

  close(): Promise<void> {
    this.manualClose = true;
    if (this.conn) return this.conn.close();
    // If reconnecting, the loop will call onCloseCb when it exits
    if (!this.reconnecting) this.onCloseCb?.();
    return Promise.resolve();
  }
}
