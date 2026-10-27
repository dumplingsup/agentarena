import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { Store } from "../src/server/store.js";
import { MatchRunner } from "../src/server/matches.js";
import { createApp } from "../src/server/app.js";
import { PRESETS } from "../src/shared/model.js";
import { applyAction } from "../src/shared/engine.js";

const stores: Store[] = [];
const memory = () => {
  const s = new Store(":memory:");
  stores.push(s);
  return s;
};
afterEach(() => {
  stores.splice(0).forEach((s) => s.close());
});
describe("persistence, asynchronous matches and accounting", () => {
  it("creates, saves, versions and copies characters", () => {
    const store = memory();
    const c = store.saveCharacter({ ...PRESETS[0], id: "", name: "新战士" });
    expect(c.id).toBeTruthy();
    expect(store.character(c.id)?.name).toBe("新战士");
    const v2 = store.saveCharacter({ ...c, prompt: "改变提示词" });
    expect(v2.version).toBe(2);
    expect(store.characters()).toHaveLength(5);
  });
  it("completes demo without keys; snapshots, logs and replay match, Elo settles once", async () => {
    const store = memory(),
      runner = new MatchRunner(store);
    const m = runner.create([PRESETS[0], PRESETS[1]], "demo", 555);
    const old = structuredClone(m.participants[0]);
    store.saveCharacter({ ...old, name: "事后改名", prompt: "NEW_PRIVATE" });
    await runner.run(m.id);
    const saved = store.match(m.id)!;
    expect(saved.status).toBe("completed");
    expect(saved.participants[0]).toEqual(old);
    expect(saved.settled).toBe(true);
    let state = saved.initial;
    for (const frame of saved.frames) {
      const r = applyAction(state, frame.action);
      expect(r.events).toEqual(frame.events);
      expect(r.state).toEqual(frame.state);
      state = r.state;
    }
    expect(state).toEqual(saved.state);
    const standings = store.standings();
    expect(standings.map((s) => s.games)).toEqual([1, 1]);
    expect(store.settle(m.id)).toBe(false);
    expect(store.standings()).toEqual(standings);
    await runner.run(m.id);
    expect(store.standings()).toEqual(standings);
  });
  it("fails openly when no key configured; failed/interrupted matches do not award points", () => {
    const store = memory(),
      runner = new MatchRunner(store, () => ({
        provider: "openai",
        model: "none",
        apiKey: "",
        thinking: "off",
        timeoutMs: 100,
        maxTokens: 100,
        matchTokens: 1000,
      }));
    expect(() => runner.create([PRESETS[0], PRESETS[1]], "llm", 1)).toThrow(
      /API Key/,
    );
    const m = runner.create([PRESETS[0], PRESETS[1]], "demo", 1);
    store.recoverInterrupted();
    expect(store.match(m.id)?.status).toBe("failed");
    expect(store.settle(m.id)).toBe(false);
    expect(store.standings()).toHaveLength(0);
  });
  it("enforces match token ceiling before sending model requests", async () => {
    const store = memory(),
      runner = new MatchRunner(store, () => ({
        provider: "openai",
        model: "none",
        apiKey: "dummy",
        thinking: "off",
        timeoutMs: 50,
        maxTokens: 100,
        matchTokens: 1000,
      }));
    const m = runner.create([PRESETS[0], PRESETS[1]], "llm", 1);
    await runner.run(m.id);
    expect(store.match(m.id)).toMatchObject({ status: "failed", tokens: 0 });
    expect(store.match(m.id)?.error).toMatch(/Token 预算/);
  });
  it("retries a cancelled match from immutable initial state, and self-play is unranked", async () => {
    const store = memory(),
      runner = new MatchRunner(store);
    const m = runner.create([PRESETS[0], PRESETS[0]], "demo", 3);
    const pending = runner.run(m.id);
    expect(runner.cancel(m.id)).toBe(true);
    await pending;
    expect(store.match(m.id)?.status).toBe("cancelled");
    await runner.run(m.id);
    expect(store.match(m.id)?.status).toBe("completed");
    expect(store.standings()).toHaveLength(0);
  });
});
describe("HTTP API", () => {
  it("persists creation, rejects illegal budget / cross-origin mutations, runs a server match and lists history", async () => {
    const store = memory(),
      { app } = createApp(store);
    const server = await new Promise<Server>((r) => {
      const s = app.listen(0, "127.0.0.1", () => r(s));
    });
    const root = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
    const post = (
      path: string,
      data: unknown,
      headers: Record<string, string> = {},
    ) =>
      fetch(root + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(data),
      });
    try {
      const made = await post("/characters", {
        ...PRESETS[0],
        id: "",
        name: "HTTP战士",
        prompt: "CUSTOM_HTTP_PROMPT",
      });
      const c = await made.json();
      expect(made.status).toBe(200);
      const copy = await (await post(`/characters/${c.id}/copy`, {})).json();
      expect(copy.id).not.toBe(c.id);
      expect(copy.prompt).toBe("CUSTOM_HTTP_PROMPT");
      const invalid = await post("/characters", { ...c, skills: ["godmode"] });
      expect(invalid.status).toBe(400);
      expect(
        (await post("/characters", c, { Origin: "https://evil.example" }))
          .status,
      ).toBe(403);
      const config = await (await fetch(root + "/config")).json();
      expect(config).not.toHaveProperty("apiKey");
      const started = await post("/matches", {
        left: c.id,
        right: "ranger",
        mode: "demo",
        seed: 5,
      });
      expect(started.status).toBe(202);
      const m = await started.json();
      let saved = m;
      for (let i = 0; i < 100; i++) {
        saved = await (await fetch(root + `/matches/${m.id}`)).json();
        if (saved.status === "completed") break;
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(saved.status).toBe("completed");
      expect(saved.frames.length).toBeGreaterThan(1);
      expect((await (await fetch(root + "/matches")).json())[0].id).toBe(m.id);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
