import { afterEach, expect, it } from "vitest";
import { createClient, createServer } from "../src/index.js";
import type { Client, JsonValue, Server } from "../src/types.js";

let server: Server | undefined;
let client: Client | undefined;

afterEach(async () => {
  await client?.close().catch(() => {});
  await server?.close().catch(() => {});
  client = undefined;
  server = undefined;
});

it("TCP: echoes a message back to the client (ping-pong)", async () => {
  server = createServer({ protocol: "tcp", port: 19001 });
  server.onConnection((conn) => conn.onMessage((msg) => void conn.send(msg)));
  await server.listen();

  client = createClient({ protocol: "tcp", host: "127.0.0.1", port: 19001 });
  const pong = new Promise<JsonValue>((r) => client!.onMessage(r));
  await client.connect();
  await client.send({ ping: 1 });

  expect(await pong).toEqual({ ping: 1 });
});

it("TCP: delivers messages to the server in order", async () => {
  const received: JsonValue[] = [];
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));

  server = createServer({ protocol: "tcp", port: 19002 });
  server.onConnection((conn) => {
    conn.onMessage((msg) => {
      received.push(msg);
      if (received.length === 3) resolve();
    });
  });
  await server.listen();

  client = createClient({ protocol: "tcp", host: "127.0.0.1", port: 19002 });
  await client.connect();
  await client.send({ n: 1 });
  await client.send({ n: 2 });
  await client.send({ n: 3 });
  await done;

  expect(received).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
});

it("TCP: fires onClose on the server connection when the client disconnects", async () => {
  let resolve!: () => void;
  const closed = new Promise<void>((r) => (resolve = r));

  server = createServer({ protocol: "tcp", port: 19003 });
  server.onConnection((conn) => conn.onClose(resolve));
  await server.listen();

  client = createClient({ protocol: "tcp", host: "127.0.0.1", port: 19003 });
  await client.connect();
  await client.close();
  await closed;
});

it("TCP: rejects send after the client connection is closed", async () => {
  server = createServer({ protocol: "tcp", port: 19004 });
  await server.listen();

  client = createClient({ protocol: "tcp", host: "127.0.0.1", port: 19004 });
  const connClosed = new Promise<void>((r) => client!.onClose(r));
  await client.connect();
  await client.close();
  await connClosed;

  await expect(client.send({ x: 1 })).rejects.toThrow();
});
