export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface Connection {
  send(message: JsonValue): Promise<void>;
  close(): Promise<void>;
  onMessage(cb: (message: JsonValue) => void): void;
  onClose(cb: () => void): void;
  onError(cb: (err: Error) => void): void;
}

export interface Server {
  listen(): Promise<void>;
  close(): Promise<void>;
  onConnection(cb: (conn: Connection) => void): void;
}

export interface Client extends Connection {
  connect(): Promise<void>;
  onReconnecting(cb: (attempt: number, delayMs: number) => void): void;
  onReconnected(cb: () => void): void;
}

export interface TcpServerOptions {
  protocol: "tcp";
  host?: string;
  port: number;
}

export interface TcpClientOptions {
  protocol: "tcp";
  host: string;
  port: number;
  reconnect?: ReconnectOptions;
  queueWhileDisconnected?: boolean;
  maxQueueSize?: number;
}

export interface WsServerOptions {
  protocol: "ws";
  host?: string;
  port: number;
}

export interface WsClientOptions {
  protocol: "ws";
  url: string;
  reconnect?: ReconnectOptions;
  queueWhileDisconnected?: boolean;
  maxQueueSize?: number;
}

export interface ReconnectOptions {
  enabled: boolean;
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  jitter?: boolean;
}

export type ServerOptions = TcpServerOptions | WsServerOptions;
export type ClientOptions = TcpClientOptions | WsClientOptions;
