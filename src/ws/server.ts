import { WebSocketServer } from "ws";
import type { Server, WsServerOptions } from "../types.js";
import { WsConnection } from "./connection.js";

export class WsServer implements Server {
  private wss: WebSocketServer;
  private onConnectionCb?: (conn: WsConnection) => void;

  constructor(private options: WsServerOptions) {
    this.wss = new WebSocketServer({ host: options.host, port: options.port });

    this.wss.on("connection", (socket) => {
      const conn = new WsConnection(socket);
      this.onConnectionCb?.(conn);
    });
  }

  onConnection(cb: (conn: WsConnection) => void): void {
    this.onConnectionCb = cb;
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.wss.address() !== null) {
        resolve();
        return;
      }
      this.wss.once("error", reject);
      this.wss.once("listening", () => {
        this.wss.removeListener("error", reject);
        resolve();
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
