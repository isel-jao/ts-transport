import { createServer, createClient } from "../src/index.js";

const PORT = 9003;

let server = createServer({ protocol: "tcp", port: PORT });

server.onConnection((conn) => {
  conn.onMessage((msg) => {
    console.log("server received:", msg);
    void conn.send({ echo: msg });
  });
});

await server.listen();
console.log(`Server listening on port ${PORT}`);

const client = createClient({
  protocol: "tcp",
  host: "127.0.0.1",
  port: PORT,
  reconnect: {
    enabled: true,
    maxAttempts: 10,
    initialDelayMs: 300,
    maxDelayMs: 3000,
    backoffFactor: 2,
    jitter: true,
  },
  queueWhileDisconnected: true,
});

// Register callbacks once — they survive reconnects automatically
client.onMessage((msg) => {
  console.log("client received:", msg);
});

let queuedOnce = false;
client.onReconnecting((attempt, delayMs) => {
  console.log(`Reconnecting... attempt ${attempt} (delay ${Math.round(delayMs)}ms)`);
  // Send during downtime: conn is null here, so this goes into the queue
  if (!queuedOnce) {
    queuedOnce = true;
    void client.send({ queued: "message" });
    console.log("Queued a message while disconnected.");
  }
});

client.onReconnected(() => {
  console.log("Reconnected! (queued messages will now flush)");
});

client.onClose(() => {
  console.log("Client finally closed.");
});

await client.connect();
console.log("Connected.");

await client.send({ hello: "world" });

// Kill the server after 500ms to trigger reconnect
await new Promise((r) => setTimeout(r, 500));
console.log("Stopping server to simulate disconnect...");
await server.close();

// Restart server after 1.5s
await new Promise((r) => setTimeout(r, 1500));
console.log("Restarting server...");
server = createServer({ protocol: "tcp", port: PORT });
server.onConnection((conn) => {
  conn.onMessage((msg) => {
    console.log("server received:", msg);
    void conn.send({ echo: msg });
  });
});
await server.listen();
console.log("Server restarted.");

// Wait for reconnect + queued message flush, then clean up
await new Promise((r) => setTimeout(r, 3500));
await client.close();
await server.close();
