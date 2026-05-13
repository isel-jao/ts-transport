import { afterEach, expect, it } from "vitest";
import { createClient, createServer } from "../src/index.js";
import type { Client, JsonValue, Server } from "../src/types.js";

// Fast reconnect options used across all reconnect tests.
// jitter:false makes delays deterministic: 50ms, 100ms, 200ms (capped), ...
const FAST_RECONNECT = {
  enabled: true,
  maxAttempts: 5,
  initialDelayMs: 50,
  maxDelayMs: 200,
  backoffFactor: 2,
  jitter: false,
} as const;

let server: Server | undefined;
let client: Client | undefined;

afterEach(async () => {
  await client?.close().catch(() => {});
  await server?.close().catch(() => {});
  client = undefined;
  server = undefined;
});

it("reconnect: client reconnects after server restart", async () => {
  let resolve!: () => void;
  const reconnected = new Promise<void>((r) => (resolve = r));

  server = createServer({ protocol: "tcp", port: 19021 });
  await server.listen();

  client = createClient({
    protocol: "tcp",
    host: "127.0.0.1",
    port: 19021,
    reconnect: FAST_RECONNECT,
  });
  client.onReconnected(resolve);
  await client.connect();

  // Tear down the server; attempt 1 (at t+50ms) will fail.
  await server.close();
  server = undefined;

  // Start the replacement server before attempt 2 (at t+150ms).
  await new Promise((r) => setTimeout(r, 70));
  server = createServer({ protocol: "tcp", port: 19021 });
  await server.listen();

  await reconnected;
});

it("reconnect: queued messages are flushed after reconnect", async () => {
  const serverMessages: JsonValue[] = [];
  let resolveMsg!: () => void;
  const msgReceived = new Promise<void>((r) => (resolveMsg = r));

  function echoServer(port: number) {
    const s = createServer({ protocol: "tcp", port });
    s.onConnection((conn) =>
      conn.onMessage((msg) => {
        serverMessages.push(msg);
        resolveMsg();
      })
    );
    return s;
  }

  server = echoServer(19022);
  await server.listen();

  client = createClient({
    protocol: "tcp",
    host: "127.0.0.1",
    port: 19022,
    reconnect: FAST_RECONNECT,
    queueWhileDisconnected: true,
  });
  await client.connect();

  // Queue exactly one message during the first onReconnecting callback
  // (fires when conn becomes null, before the first retry delay).
  let queued = false;
  const queueDone = new Promise<void>((r) => {
    client!.onReconnecting(() => {
      if (!queued) {
        queued = true;
        void client!.send({ queued: true });
        r();
      }
    });
  });

  await server.close();
  server = undefined;
  await queueDone;

  // Bring the server back up before attempt 2 (at t+150ms from disconnect).
  await new Promise((r) => setTimeout(r, 70));
  server = echoServer(19022);
  await server.listen();

  await msgReceived;
  expect(serverMessages).toContainEqual({ queued: true });
});

it("reconnect: fires onClose when maxAttempts is exhausted", async () => {
  let resolve!: () => void;
  const closed = new Promise<void>((r) => (resolve = r));

  server = createServer({ protocol: "tcp", port: 19023 });
  await server.listen();

  client = createClient({
    protocol: "tcp",
    host: "127.0.0.1",
    port: 19023,
    reconnect: { enabled: true, maxAttempts: 2, initialDelayMs: 30, maxDelayMs: 100, backoffFactor: 2, jitter: false },
  });
  client.onClose(resolve);
  await client.connect();

  // Close server permanently — both attempts will fail.
  await server.close();
  server = undefined;

  // Should fire after attempt 1 (30ms) + attempt 2 (60ms) both fail.
  await closed;
});

it("reconnect: manual close during reconnect stops the loop", async () => {
  let resolve!: () => void;
  const closed = new Promise<void>((r) => (resolve = r));

  server = createServer({ protocol: "tcp", port: 19024 });
  await server.listen();

  client = createClient({
    protocol: "tcp",
    host: "127.0.0.1",
    port: 19024,
    reconnect: { enabled: true, maxAttempts: 10, initialDelayMs: 100, maxDelayMs: 1000, backoffFactor: 2, jitter: false },
  });
  client.onClose(resolve);
  await client.connect();

  await server.close();
  server = undefined;

  // Close the client while the reconnect loop is sleeping (well within the 100ms delay).
  await new Promise((r) => setTimeout(r, 30));
  await client.close();

  // onClose fires once the current sleep expires and the loop sees manualClose.
  await closed;
});
