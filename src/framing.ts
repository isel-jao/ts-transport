const HEADER_SIZE = 4;
const MAX_FRAME_SIZE = 10 * 1024 * 1024; // 10 MB

export function encodeFrame(message: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const frame = Buffer.allocUnsafe(HEADER_SIZE + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, HEADER_SIZE);
  return frame;
}

export class FrameDecoder {
  private buffer = Buffer.alloc(0);

  push(
    chunk: Buffer,
    onFrame: (payload: Buffer) => void,
    onError: (err: Error) => void
  ): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= HEADER_SIZE) {
      const length = this.buffer.readUInt32BE(0);

      if (length > MAX_FRAME_SIZE) {
        onError(new Error(`Frame size ${length} exceeds max ${MAX_FRAME_SIZE}`));
        this.buffer = Buffer.alloc(0);
        return;
      }

      const totalSize = HEADER_SIZE + length;
      if (this.buffer.length < totalSize) break;

      const payload = this.buffer.subarray(HEADER_SIZE, totalSize);
      this.buffer = this.buffer.subarray(totalSize);
      onFrame(payload);
    }
  }

  reset(): void {
    this.buffer = Buffer.alloc(0);
  }
}
