# ts-transport — Implementation Plan

Build a TypeScript library called `ts-transport` — a transport abstraction layer for network communication. The protocol is selected at runtime via constructor options, so the same application code works across all supported protocols.

## Goal

Provide a unified API for `Server`, `Client`, and `Connection` that hides the underlying network protocol. Switching protocols should be a one-line change in the caller's code.

## Initial Protocols

- **TCP** (via Node's built-in `net` module)
- **WebSocket** (via the `ws` package)

The architecture must make it straightforward to add more transports later (gRPC, QUIC, IPC, etc.) without changing consumer code.

---

## Tech Stack

- TypeScript, strict mode
- Node.js, ESM (`"type": "module"`)
- pnpm for package management
- Runtime dependency: `ws`
- Dev dependencies: `typescript`, `@types/node`, `@types/ws`, `tsx`
- No other dependencies — keep it lean

---

## Functional Requirements

### Core API

- `createServer(options)` factory returning a `Server`
- `createClient(options)` factory returning a `Client`
- Options are a discriminated union on `protocol: 'tcp' | 'ws'`
- Messages are JSON-serializable objects or arrays — auto-serialized on send, auto-parsed on receive
- Callback-based event API (`onMessage`, `onClose`, `onError`, `onConnection`) — not EventEmitter, not async iterators
- All async operations (`listen`, `connect`, `send`, `close`) return Promises

### TCP Framing

- TCP is a byte stream with no message boundaries — needs length-prefix framing
- Format: `[4 bytes: payload length (uint32 BE)] [N bytes: JSON payload]`
- Handle partial chunks (one frame split across multiple `data` events)
- Handle multiple frames per chunk (multiple messages in one `data` event)
- Enforce max frame size (10MB) to prevent memory exhaustion — reject oversized frames, emit error, close connection

### WebSocket

- WebSocket already delivers discrete messages — no custom framing needed
- Use the `ws` library's built-in message boundaries

---

## Error Handling Rules

- Never throw asynchronously — route all errors through `onError` callbacks
- JSON parse failures must not crash the connection — emit via `onError`, continue
- `send()` on a closed connection rejects with a clear error
- `close()` must be idempotent (calling multiple times is safe)
- Oversized frames emit an error and close the connection gracefully

---

## Reconnect Behavior (Client only)

The `Client` must support automatic reconnection. Servers do **not** reconnect — they accept new connections.

### Key Principle

The `Client` is a stable handle. Callbacks registered via `onMessage`, `onClose`, `onError` survive across reconnects and are automatically re-attached to each new underlying socket. **Users register once; the library handles re-binding internally.**

### Reconnect Options

```typescript
reconnect?: {
  enabled: boolean           // enable/disable reconnection
  maxAttempts?: number       // default: Infinity
  initialDelayMs?: number    // default: 500
  maxDelayMs?: number        // default: 30000
  backoffFactor?: number     // default: 2 (exponential backoff)
  jitter?: boolean           // default: true (add randomness to avoid thundering herd)
}
```

### Reconnect Behavior Details

- On unexpected disconnect, attempt reconnection with **exponential backoff** + optional jitter
- User-registered callbacks (`onMessage`, `onClose`, `onError`) persist across reconnects — re-bind them to each new socket automatically
- Add two new lifecycle callbacks on `Client`:
  - `onReconnecting(cb: (attempt: number, delayMs: number) => void)` — fires before each reconnect attempt
  - `onReconnected(cb: () => void)` — fires when reconnection succeeds
- `onClose` fires only on **final** close (manual `close()` or `maxAttempts` exhausted), not on intermediate drops
- Manual `close()` disables reconnection — the client stays closed
- `send()` while disconnected:
  - **Default behavior**: reject the Promise with a "not connected" error
  - **Optional**: `queueWhileDisconnected: boolean` option to buffer outbound messages and flush on reconnect
    - Bounded queue: max 1000 messages (configurable)
    - Reject new `send()` calls if queue is full
    - Flush queued messages in order after successful reconnect

### Internal Design

Treat the `Client` as a wrapper owning a replaceable inner socket. On disconnect:

1. Detach from the dead socket
2. Run the exponential backoff loop
3. Create a fresh socket via `connect()`
4. Re-bind all persistent user callbacks to the new socket
5. Flush any queued messages (if `queueWhileDisconnected` enabled)

The user's `Client` reference never changes — reconnection is transparent.

### Applies to Both TCP and WebSocket

The reconnect logic lives in **shared client infrastructure**, not inside each transport. Each transport just needs to expose "connect a fresh socket" — the reconnect orchestration is protocol-agnostic.

---

## Deliverables

### Code

- Working library with both TCP and WebSocket transports implemented
- Factory functions `createServer()` and `createClient()` with correct protocol dispatch
- Proper TypeScript types with no `any` in the public API
- Strict mode passes with zero errors

### Examples

- **Example 1** (ping-tcp.ts): Simple ping-pong over TCP
  - Server echoes received messages
  - Client sends `{ ping: 1 }`, receives `{ pong: 1 }`
  - Demonstrates basic Server and Client API
- **Example 2** (ping-ws.ts): **Identical code to Example 1, except protocol options differ**
  - Proves the abstraction holds — same application code works with different transports
- **Example 3** (reconnect.ts): Demonstrates reconnect with callback persistence
  - Client connects and registers `onMessage` callback
  - Server is manually stopped (or socket killed) mid-session
  - Client automatically reconnects with exponential backoff
  - Original `onMessage` callback fires on new messages without re-registration
  - Optionally demonstrates `queueWhileDisconnected` — messages sent during downtime are queued and flushed on reconnect

### Documentation

- **README.md** with:
  - What it is (transport abstraction, why it matters)
  - Installation (`pnpm add ts-transport`)
  - Quick start (basic Server + Client snippet)
  - Switching protocols (one-line change example)
  - Reconnect setup and configuration
  - Full API reference (`createServer`, `createClient`, `Server`, `Client`, all options, all callbacks)
  - TCP framing protocol spec (for anyone implementing a compatible client in another language)
  - Example usage (copy-paste from the example files)

### Quality

- `pnpm build` succeeds with zero TypeScript errors in strict mode
- `pnpm example:tcp`, `pnpm example:ws`, `pnpm example:reconnect` all run and exit cleanly
- All async operations properly reject/resolve; no unhandled rejections
- Closing a server closes all active connections cleanly
- Reconnecting client re-binds callbacks transparently — no user code changes required

---

## Out of Scope (do NOT implement)

- TLS / WSS (HTTPS-like security for WebSocket)
- Heartbeat / ping-pong at protocol level (application can implement if needed)
- Backpressure handling (`drain` events, write buffering)
- Per-message compression
- Authentication / custom handshake protocol
- Schema validation (Zod, valibot, etc.)
- Additional transports (gRPC, QUIC, IPC, HTTP/2)
- Request-response patterns (RPC layer on top)
- Message ordering guarantees beyond what TCP/WS provide

---

## Implementation Notes

### Design Decisions for Claude Code

1. **Folder structure**: You decide. Consider separation of concerns: types, transports, factories, framing.

2. **File organization**: Keep each file focused and under ~150 lines if possible. Split larger files.

3. **No test framework**: Examples serve as smoke tests. No unit tests in this phase.

4. **Callback vs EventEmitter**: Spec requires callbacks (not EventEmitter). This keeps the API simpler and avoids inheritance/mixin complexity.

5. **Framing implementation hint**:
   - A `FrameDecoder` class accumulates incoming `data` chunks into a buffer
   - Check if buffer has at least 4 bytes (to read the length header)
   - While buffer is large enough, read the length, check if full frame is present
   - If yes, slice it out, emit the frame, continue loop
   - If no, wait for more data
   - Handle arbitrary chunk boundaries correctly

6. **Reconnect architecture**:
   - The `Client` wrapper owns the reconnect loop and callback registry
   - Each transport (`TcpClient`, `WsClient`) implements a basic "connect once" protocol
   - The wrapper calls the transport's connect method repeatedly with backoff
   - After each successful connect, re-bind stored callbacks

7. **TypeScript**: Use strict mode. Discriminated unions for options. No `as any` escapes.

---

## Development Process

Work in phases. After each phase, summarize what you did and pause for feedback:

1. **Project scaffolding** — `package.json`, `tsconfig.json`, folder structure
2. **Shared types** — All interfaces (`Server`, `Client`, `Connection`, options, callbacks)
3. **TCP framing** — `FrameDecoder`, encode/decode functions
4. **TCP transport** — Connection wrapper, Server, Client for TCP
5. **WebSocket transport** — Connection wrapper, Server, Client for WebSocket
6. **Factories** — `createServer()`, `createClient()`, public exports
7. **Reconnect logic** — Client reconnect wrapper, backoff, callback persistence, queue buffer
8. **Example 1 & 2** — ping-tcp.ts and ping-ws.ts (identical except options)
9. **Example 3** — reconnect.ts demonstrating auto-reconnect with callback persistence
10. **README** — Full documentation and API reference

Stop after each phase for review.
