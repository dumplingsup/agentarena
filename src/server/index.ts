import "dotenv/config";
import express from "express";
import { resolve } from "node:path";
import { createApp } from "./app.js";
const { app, store, runner } = createApp();
store.recoverInterrupted();
if (process.argv.includes("--production")) {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, "127.0.0.1", () =>
  console.log(`Agent Arena http://localhost:${port}`),
);
process.on("SIGINT", () => {
  for (const c of runner.active.values()) c.abort();
  server.close();
  process.exit(0);
});
