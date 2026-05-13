import net from "node:net";
import { FrameDecoder, encodeFrame } from "./framing.js";
import type { Connection, JsonValue } from "../types.js";

export class TcpConnection implements Connection {
  private onMessageCb?: (msg: JsonValue) => void;
  private onCloseCb?: () => void;
  private onErrorCb?: (err: Error) => void;
  private closed = false;
  private decoder = new FrameDecoder();

  constructor(private socket: net.Socket) {
    socket.on("data", (chunk) => {
      this.decoder.push(
        chunk,
        (payload) => {
          let msg: JsonValue;
          try {
            msg = JSON.parse(payload.toString("utf8")) as JsonValue;
          } catch (e) {
            this.onErrorCb?.(new Error(`JSON parse error: ${String(e)}`));
            return;
          }
          this.onMessageCb?.(msg);
        },
        (err) => {
          this.onErrorCb?.(err);
          this.socket.destroy();
        }
      );
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
      const frame = encodeFrame(message);
      this.socket.write(frame, (err) => {
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
      this.socket.end(() => resolve());
    });
  }

  get raw(): net.Socket {
    return this.socket;
  }
}
