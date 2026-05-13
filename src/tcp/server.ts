import net from "node:net";
import type { Server, TcpServerOptions } from "../types.js";
import { TcpConnection } from "./connection.js";

export class TcpServer implements Server {
  private server: net.Server;
  private onConnectionCb?: (conn: TcpConnection) => void;
  private activeSockets = new Set<net.Socket>();

  constructor(private options: TcpServerOptions) {
    this.server = net.createServer((socket) => {
      this.activeSockets.add(socket);
      socket.once("close", () => this.activeSockets.delete(socket));
      const conn = new TcpConnection(socket);
      this.onConnectionCb?.(conn);
    });

    this.server.on("error", () => {
      // errors surface via listen() rejection; individual conn errors are on TcpConnection
    });
  }

  onConnection(cb: (conn: TcpConnection) => void): void {
    this.onConnectionCb = cb;
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.options.port, this.options.host ?? "0.0.0.0", () => {
        this.server.removeListener("error", reject);
        resolve();
      });
    });
  }

  close(): Promise<void> {
    for (const socket of this.activeSockets) socket.destroy();
    this.activeSockets.clear();
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
