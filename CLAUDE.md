# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`ts-transport` — a TypeScript transport abstraction library. The same `Server`/`Client`/`Connection` API works over TCP or WebSocket; the protocol is selected at runtime via constructor options.

## Tech Stack

- TypeScript strict mode, ESM (`"type": "module"`)
- Node.js — built-in `net` module for TCP, `ws` package for WebSocket
- pnpm for package management
- No test framework — examples in `examples/` serve as smoke tests

## Commands

```bash
pnpm install          # install dependencies
pnpm build            # tsc — must pass with zero errors
pnpm example:tcp      # run examples/ping-tcp.ts
pnpm example:ws       # run examples/ping-ws.ts
pnpm example:reconnect # run examples/reconnect.ts
```

Run a single example with tsx directly:

```bash
pnpm exec tsx examples/ping-tcp.ts
```

## Architecture

### Public API surface

- `createServer(options)` / `createClient(options)` — factory functions, discriminated union on `protocol: 'tcp' | 'ws'`
- Callback-based lifecycle: `onMessage`, `onClose`, `onError`, `onConnection`
- All async ops (`listen`, `connect`, `send`, `close`) return Promises

### Layer separation (decide folder structure, but keep concerns split)

1. **Types** — shared interfaces for `Server`, `Client`, `Connection`, options, callbacks. No `any` in the public API.
2. **TCP framing** — `FrameDecoder` class + encode/decode helpers. Format: `[4-byte uint32 BE length][JSON payload]`. Must handle partial chunks and multi-frame chunks. Max frame: 10 MB.
3. **TCP transport** — thin wrappers over Node `net`; implement "connect once" / "listen once" primitives.
4. **WebSocket transport** — thin wrappers over `ws`; no custom framing needed (messages are already discrete).
5. **Reconnect wrapper** — lives in shared client infrastructure, not inside either transport. Owns the exponential-backoff loop, callback registry, and optional outbound queue. Each transport just exposes "connect a fresh socket."
6. **Factories** — dispatch to the right transport based on `protocol`, re-export everything.

### Reconnect design

- `Client` is a stable handle; callbacks registered via `onMessage`/`onClose`/`onError` survive reconnects.
- On disconnect: detach dead socket → backoff loop → fresh `connect()` → re-bind callbacks → flush queued messages.
- `onClose` fires only on final close (manual `close()` or `maxAttempts` exhausted).
- `send()` while disconnected rejects by default; set `queueWhileDisconnected: true` to buffer (max 1000 messages).

### Error handling rules

- Never throw asynchronously — route all errors through `onError` callbacks.
- JSON parse failures emit via `onError` and continue (do not crash the connection).
- `close()` must be idempotent.
- Oversized TCP frames emit an error and close the connection.

## Out of scope

TLS/WSS, heartbeat/ping-pong, backpressure, compression, auth, schema validation, additional transports (gRPC, QUIC, IPC), RPC patterns.
