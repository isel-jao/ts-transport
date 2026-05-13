# ts-transport

A transport abstraction layer for Node.js. The same `Server`/`Client` API works over TCP or WebSocket — switching protocols is a one-line change.

## Installation

```bash
pnpm add @isel-jao/ts-transport
```

## Quick start

```typescript
import { createServer, createClient } from "ts-transport";

const server = createServer({ protocol: "tcp", port: 9001 });

server.onConnection((conn) => {
  conn.onMessage((msg) => {
    void conn.send({ pong: (msg as any).ping });
  });
});

await server.listen();

const client = createClient({ protocol: "tcp", host: "127.0.0.1", port: 9001 });

client.onMessage((msg) => console.log("received:", msg));

await client.connect();
await client.send({ ping: 1 });
```

## Switching protocols

Change one option — all application code is identical:

```typescript
// TCP
const server = createServer({ protocol: "tcp", port: 9001 });
const client = createClient({ protocol: "tcp", host: "127.0.0.1", port: 9001 });

// WebSocket — same API, different options
const server = createServer({ protocol: "ws", port: 9001 });
const client = createClient({ protocol: "ws", url: "ws://127.0.0.1:9001" });
```

## Reconnection

Clients support automatic reconnection with exponential backoff. Callbacks registered before `connect()` survive reconnects without re-registration.

```typescript
const client = createClient({
  protocol: "tcp",
  host: "127.0.0.1",
  port: 9001,
  reconnect: {
    enabled: true,
    maxAttempts: 10,       // default: Infinity
    initialDelayMs: 500,   // default: 500
    maxDelayMs: 30000,     // default: 30000
    backoffFactor: 2,      // default: 2
    jitter: true,          // default: true
  },
  queueWhileDisconnected: true,  // buffer outbound messages during downtime
  maxQueueSize: 1000,            // default: 1000
});

// Register once — re-bound automatically on each reconnect
client.onMessage((msg) => console.log(msg));
client.onReconnecting((attempt, delayMs) => console.log(`attempt ${attempt}`));
client.onReconnected(() => console.log("back online"));

await client.connect();
```

`onClose` fires only on final close (manual `close()` or `maxAttempts` exhausted). Messages sent while disconnected with `queueWhileDisconnected: true` are buffered and flushed in order after reconnect — but they must be sent from within a callback where the client is already known to be disconnected (e.g. `onReconnecting`), not immediately after calling `server.close()` on the other end, because the disconnect detection is asynchronous.

## API reference

### `createServer(options: ServerOptions): Server`

| Option | Type | Description |
|--------|------|-------------|
| `protocol` | `"tcp" \| "ws"` | Transport protocol |
| `port` | `number` | Port to listen on |
| `host` | `string` | Bind address (default: `"0.0.0.0"`) |

### `createClient(options: ClientOptions): Client`

**TCP:**

| Option | Type | Description |
|--------|------|-------------|
| `protocol` | `"tcp"` | |
| `host` | `string` | Server hostname |
| `port` | `number` | Server port |
| `reconnect` | `ReconnectOptions` | See above |
| `queueWhileDisconnected` | `boolean` | Buffer sends during downtime |
| `maxQueueSize` | `number` | Max buffered messages (default: 1000) |

**WebSocket:**

| Option | Type | Description |
|--------|------|-------------|
| `protocol` | `"ws"` | |
| `url` | `string` | WebSocket URL, e.g. `ws://host:port` |
| `reconnect` | `ReconnectOptions` | See above |
| `queueWhileDisconnected` | `boolean` | Buffer sends during downtime |
| `maxQueueSize` | `number` | Max buffered messages (default: 1000) |

### `Server`

```typescript
interface Server {
  listen(): Promise<void>;
  close(): Promise<void>;
  onConnection(cb: (conn: Connection) => void): void;
}
```

### `Client`

Extends `Connection` with:

```typescript
interface Client extends Connection {
  connect(): Promise<void>;
  onReconnecting(cb: (attempt: number, delayMs: number) => void): void;
  onReconnected(cb: () => void): void;
}
```

### `Connection`

```typescript
interface Connection {
  send(message: JsonValue): Promise<void>;
  close(): Promise<void>;
  onMessage(cb: (message: JsonValue) => void): void;
  onClose(cb: () => void): void;
  onError(cb: (err: Error) => void): void;
}
```

Messages are `JsonValue` — any JSON-serializable value. Auto-serialized on send, auto-parsed on receive.

## TCP framing protocol

TCP is a byte stream. `ts-transport` frames messages with a 4-byte length prefix:

```
[4 bytes: payload length (uint32 big-endian)] [N bytes: UTF-8 JSON payload]
```

- Partial chunks are buffered until a complete frame arrives.
- Multiple frames in one chunk are all decoded.
- Frames larger than 10 MB are rejected: an error is emitted and the connection is closed.

This spec is sufficient to implement a compatible client in any language.
