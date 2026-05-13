import WebSocket from "ws";
import type { Connection, JsonValue } from "../types.js";

export class WsConnection implements Connection {
  private onMessageCb?: (msg: JsonValue) => void;
  private onCloseCb?: () => void;
  private onErrorCb?: (err: Error) => void;
  private closed = false;

  constructor(private socket: WebSocket) {
    socket.on("message", (data) => {
      let msg: JsonValue;
      try {
        msg = JSON.parse(data.toString()) as JsonValue;
      } catch (e) {
        this.onErrorCb?.(new Error(`JSON parse error: ${String(e)}`));
        return;
      }
      this.onMessageCb?.(msg);
    });

    socket.on("close", () => {
      this.closed = true;
      this.onCloseCb?.();
    });

    socket.on("error", (err) => {
      this.onErrorCb?.(err);
    });
  }

  onMessage(cb: (msg: JsonValue) => void): void {
    this.onMessageCb = cb;
  }

  onClose(cb: () => void): void {
    this.onCloseCb = cb;
  }

  onError(cb: (err: Error) => void): void {
    this.onErrorCb = cb;
  }

  send(message: JsonValue): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error("Cannot send on a closed connection"));
        return;
      }
      this.socket.send(JSON.stringify(message), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.closed) {
        resolve();
        return;
      }
      this.socket.once("close", () => resolve());
      this.socket.close();
    });
  }
}
