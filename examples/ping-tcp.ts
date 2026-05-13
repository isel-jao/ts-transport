import { createServer, createClient } from "../src/index.js";

const PORT = 9001;

const server = createServer({ protocol: "tcp", port: PORT });

server.onConnection((conn) => {
  conn.onMessage((msg) => {
    void conn.send({ pong: (msg as { ping: number }).ping });
  });
});

await server.listen();
console.log(`TCP server listening on port ${PORT}`);

const client = createClient({ protocol: "tcp", host: "127.0.0.1", port: PORT });

client.onMessage((msg) => {
  console.log("client received:", msg);
  void client.close().then(() => server.close());
});

await client.connect();
await client.send({ ping: 1 });
console.log("client sent: { ping: 1 }");
