import { describe, expect, it } from "vitest";
import { FrameDecoder, encodeFrame } from "./framing.js";

describe("encodeFrame", () => {
  it("writes 4-byte big-endian length then JSON payload", () => {
    const msg = { hello: "world" };
    const json = JSON.stringify(msg);
    const frame = encodeFrame(msg);
    expect(frame.readUInt32BE(0)).toBe(Buffer.byteLength(json, "utf8"));
    expect(frame.subarray(4).toString("utf8")).toBe(json);
    expect(frame.length).toBe(4 + Buffer.byteLength(json, "utf8"));
  });
});

describe("FrameDecoder", () => {
  it("decodes a single complete frame", () => {
    const decoder = new FrameDecoder();
    const payloads: Buffer[] = [];
    decoder.push(
      encodeFrame({ x: 1 }),
      (p) => payloads.push(p),
      () => {}
    );
    expect(payloads).toHaveLength(1);
    expect(JSON.parse(payloads[0]!.toString("utf8"))).toEqual({ x: 1 });
  });

  it("buffers a partial chunk and decodes when the rest arrives", () => {
    const decoder = new FrameDecoder();
    const payloads: Buffer[] = [];
    const frame = encodeFrame({ x: 2 });
    decoder.push(frame.subarray(0, 3), (p) => payloads.push(p), () => {});
    expect(payloads).toHaveLength(0);
    decoder.push(frame.subarray(3), (p) => payloads.push(p), () => {});
    expect(payloads).toHaveLength(1);
    expect(JSON.parse(payloads[0]!.toString("utf8"))).toEqual({ x: 2 });
  });

  it("decodes two frames delivered in one push", () => {
    const decoder = new FrameDecoder();
    const payloads: Buffer[] = [];
    const combined = Buffer.concat([encodeFrame({ a: 1 }), encodeFrame({ b: 2 })]);
    decoder.push(combined, (p) => payloads.push(p), () => {});
    expect(payloads).toHaveLength(2);
    expect(JSON.parse(payloads[0]!.toString("utf8"))).toEqual({ a: 1 });
    expect(JSON.parse(payloads[1]!.toString("utf8"))).toEqual({ b: 2 });
  });

  it("emits an error for a frame exceeding 10 MB", () => {
    const decoder = new FrameDecoder();
    const errors: Error[] = [];
    const oversized = Buffer.allocUnsafe(4);
    oversized.writeUInt32BE(11 * 1024 * 1024, 0);
    decoder.push(oversized, () => {}, (e) => errors.push(e));
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/exceeds max/);
  });

  it("reset() discards buffered bytes so the next push starts fresh", () => {
    const decoder = new FrameDecoder();
    const payloads: Buffer[] = [];
    const frame = encodeFrame({ x: 1 });
    decoder.push(frame.subarray(0, 3), (p) => payloads.push(p), () => {});
    decoder.reset();
    decoder.push(encodeFrame({ y: 2 }), (p) => payloads.push(p), () => {});
    expect(payloads).toHaveLength(1);
    expect(JSON.parse(payloads[0]!.toString("utf8"))).toEqual({ y: 2 });
  });
});
