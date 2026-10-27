import express from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { characterSchema, PRESETS } from "../shared/model.js";
import { publicConfig } from "./config.js";
import { MatchRunner } from "./matches.js";
import { Store } from "./store.js";

export function createApp(
  store = new Store(process.env.ARENA_DB || "data/arena.sqlite"),
) {
  const app = express(),
    runner = new MatchRunner(store);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "40kb" }));
  // Local app: browsers from a different origin cannot trigger paid model calls.
  app.use("/api", (req, res, next) => {
    const origin = req.get("origin");
    if (
      origin &&
      origin !== `http://${req.get("host")}` &&
      origin !== `https://${req.get("host")}`
    ) {
      res.status(403).json({ error: "跨来源请求被拒绝" });
      return;
    }
    next();
  });
  app.get("/api/config", (_req, res) => res.json(publicConfig()));
  app.get("/api/characters", (_req, res) => res.json(store.characters()));
  app.get("/api/presets", (_req, res) => res.json(PRESETS));
  app.post("/api/characters", (req, res) =>
    res.json(store.saveCharacter(req.body)),
  );
  app.post("/api/characters/:id/copy", (req, res) => {
    const c = store.character(String(req.params.id));
    if (!c) {
      res.status(404).json({ error: "角色不存在" });
      return;
    }
    res.json(
      store.saveCharacter({
        ...c,
        id: randomUUID(),
        name: c.name.slice(0, 32) + " · 副本",
        version: 1,
      }),
    );
  });
  app.get("/api/standings", (req, res) =>
    res.json(store.standings(req.query.mode === "llm" ? "llm" : "demo")),
  );
  app.get("/api/matches", (_req, res) =>
    res.json(store.matches().map((m) => ({ ...m, frames: [], failures: [] }))),
  );
  app.get("/api/matches/:id", (req, res) => {
    const m = store.match(String(req.params.id));
    if (!m) {
      res.status(404).json({ error: "比赛不存在" });
      return;
    }
    res.json(m);
  });
  const startSchema = z
    .object({
      left: z.string(),
      right: z.string(),
      mode: z.enum(["demo", "llm"]),
      seed: z.number().int().min(0).max(4294967295).default(42),
      maxPlies: z.number().int().min(10).max(80).default(80),
    })
    .strict();
  app.post("/api/matches", (req, res) => {
    const b = startSchema.parse(req.body),
      left = store.character(b.left),
      right = store.character(b.right);
    if (!left || !right) {
      res.status(404).json({ error: "参赛角色不存在" });
      return;
    }
    characterSchema.parse(left);
    characterSchema.parse(right);
    const m = runner.create([left, right], b.mode, b.seed, true, b.maxPlies);
    void runner.run(m.id);
    res.status(202).json(m);
  });
  app.post("/api/matches/:id/cancel", (req, res) =>
    res.json({ cancelled: runner.cancel(String(req.params.id)) }),
  );
  app.post("/api/matches/:id/retry", (req, res) => {
    const id = String(req.params.id),
      m = store.match(id);
    if (!m || !["failed", "cancelled"].includes(m.status)) {
      res.status(400).json({ error: "只有失败或取消的比赛可重试" });
      return;
    }
    if (runner.active.size >= 2) {
      res.status(409).json({ error: "当前比赛队列已满" });
      return;
    }
    void runner.run(id);
    res.status(202).json({ id });
  });
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(400)
        .json({
          error:
            error instanceof z.ZodError
              ? error.issues
                  .map((i) => `${i.path.join(".")}: ${i.message}`)
                  .join("\n")
              : error instanceof Error
                ? error.message
                : "请求失败",
        });
    },
  );
  return { app, runner, store };
}
