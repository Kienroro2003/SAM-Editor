import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { closeDbPool } from "./config/db.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`);
});

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);

  server.close(async () => {
    await closeDbPool();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
