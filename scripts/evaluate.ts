import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Store } from "../src/server/store.js";
import { MatchRunner } from "../src/server/matches.js";
import { modelConfig } from "../src/server/config.js";
import { PRESETS } from "../src/shared/model.js";

const llm = process.argv.includes("--llm");
const option = (name: string, fallback: string) =>
  process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=") || fallback;
const games = Math.max(1, Math.min(10, +option("games", "1"))),
  maxPlies = Math.max(10, Math.min(80, +option("max-plies", "30")));
const config = modelConfig();
if (llm && !config.apiKey) {
  console.error(
    "未配置 API Key，未发送请求。填写 .env 后运行 npm run evaluate -- --llm --games=1。",
  );
  process.exit(1);
}
const store = new Store("data/evaluation.sqlite"),
  runner = new MatchRunner(store);
const prompts = [
  {
    label: "主动施压",
    prompt:
      "优先尽快造成伤害。接近敌人，用冲锋与攻击压制；生命低于30%时使用药剂。只在无法攻击且能量不足时防御。",
  },
  {
    label: "资源与生存",
    prompt:
      "谨慎观察，利用掩体接近远程敌人。优先保护生命，低于60%使用药剂；合理用护盾抵消爆发，等待合适时机冲锋。避免浪费移动和资源。",
  },
];
const results = [];
try {
  for (const [index, variant] of prompts.entries()) {
    const character = {
      ...structuredClone(PRESETS[0]),
      id: `evaluation-${index}`,
      prompt: variant.prompt,
    };
    const matches = [];
    for (let i = 0; i < games; i++) {
      const m = runner.create(
        [character, PRESETS[1]],
        llm ? "llm" : "demo",
        100 + i,
        false,
        maxPlies,
      );
      await runner.run(m.id, [llm ? "llm" : "demo", "demo"]);
      const saved = store.match(m.id)!;
      const own = saved.frames.filter((f) => f.actor === 0);
      matches.push({
        id: saved.id,
        seed: saved.initial.seed,
        status: saved.status,
        error: saved.error,
        winner: saved.state.winner,
        tokens: own.reduce((n, f) => n + f.decision.totalTokens, 0),
        latencyMs: own.reduce((n, f) => n + f.decision.latencyMs, 0),
        actions: own.map((f) => ({
          action: f.action,
          tokens: f.decision.totalTokens,
        })),
      });
      console.log(
        `${variant.label} · seed ${100 + i} · ${saved.status} · winner ${saved.state.winner} · ${saved.tokens} tokens`,
      );
    }
    const completed = matches.filter((m) => m.status === "completed");
    results.push({
      ...variant,
      completed: completed.length,
      wins: completed.filter((m) => m.winner === 0).length,
      winRate: completed.length
        ? completed.filter((m) => m.winner === 0).length / completed.length
        : null,
      totalTokens: matches.reduce((n, m) => n + m.tokens, 0),
      matches,
    });
  }
  const report = {
    generatedAt: new Date().toISOString(),
    mode: llm ? "llm-vs-demo" : "demo-mechanism-check",
    provider: llm ? config.provider : null,
    model: llm ? config.model : null,
    note: llm
      ? "Same character stats/skills/model, paired seeds, same demo opponent; small sample does not establish statistical advantage."
      : "Demo ignores freeform prompts. This verifies paired evaluation plumbing, not LLM prompt effectiveness.",
    maxPlies,
    results,
  };
  const output = option("out", `docs/evaluation-${llm ? "llm" : "demo"}.json`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(`Report: ${output}`);
} finally {
  store.close();
}
