import type { Client, ClientOptions, Server, ServerOptions } from "./types.js";
import { TcpServer } from "./tcp/server.js";
import { TcpRawClient } from "./tcp/client.js";
import { WsServer } from "./ws/server.js";
import { WsRawClient } from "./ws/client.js";
import { ReconnectingClient } from "./reconnect.js";

export function createServer(options: ServerOptions): Server {
  if (options.protocol === "tcp") return new TcpServer(options);
  if (options.protocol === "ws") return new WsServer(options);
  throw new Error(`Unknown protocol: ${(options as { protocol: string }).protocol}`);
}

export function createClient(options: ClientOptions): Client {
  if (options.protocol === "tcp") {
    const raw = new TcpRawClient(options);
    return new ReconnectingClient(raw, options);
  }
  if (options.protocol === "ws") {
    const raw = new WsRawClient(options);
    return new ReconnectingClient(raw, options);
  }
  throw new Error(`Unknown protocol: ${(options as { protocol: string }).protocol}`);
}
