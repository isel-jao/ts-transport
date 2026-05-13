import WebSocket from "ws";
import type { WsClientOptions } from "../types.js";
import { WsConnection } from "./connection.js";

export class WsRawClient {
  constructor(private options: WsClientOptions) {}

  connect(): Promise<WsConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.options.url);

      socket.once("open", () => {
        socket.removeListener("error", reject);
        resolve(new WsConnection(socket));
      });

      socket.once("error", reject);
    });
  }
}
