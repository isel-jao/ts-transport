import { createServer, createClient } from "../src/index.js";

const PORT = 9002;

const server = createServer({ protocol: "ws", port: PORT });

server.onConnection((conn) => {
  conn.onMessage((msg) => {
    void conn.send({ pong: (msg as { ping: number }).ping });
  });
});

await server.listen();
console.log(`WebSocket server listening on port ${PORT}`);

const client = createClient({
  protocol: "ws",
  url: `ws://127.0.0.1:${PORT}`,
});

client.onMessage((msg) => {
  console.log("client received:", msg);
  void client.close().then(() => server.close());
});

await client.connect();
await client.send({ ping: 1 });
console.log("client sent: { ping: 1 }");
