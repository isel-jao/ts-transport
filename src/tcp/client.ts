import net from "node:net";
import type { TcpClientOptions } from "../types.js";
import { TcpConnection } from "./connection.js";

export class TcpRawClient {
  constructor(private options: TcpClientOptions) {}

  connect(): Promise<TcpConnection> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(
        { host: this.options.host, port: this.options.port },
        () => {
          socket.removeListener("error", reject);
          resolve(new TcpConnection(socket));
        }
      );
      socket.once("error", reject);
    });
  }
}
