import { randomUUID } from "node:crypto";
import { setImmediate as yieldEventLoop } from "node:timers/promises";
import { applyAction, createBattle } from "../shared/engine.js";
import { chooseDemo } from "../shared/bot.js";
import type { Character, DecisionMeta, Match } from "../shared/model.js";
import {
  DecisionFailure,
  decideLLM,
  decisionReservation,
  safeError,
} from "./runtime.js";
import { modelConfig, type ModelConfig } from "./config.js";
import { Store } from "./store.js";

export class MatchRunner {
  active = new Map<string, AbortController>();
  constructor(
    public store: Store,
    public config: () => ModelConfig = modelConfig,
  ) {}
  create(
    participants: [Character, Character],
    mode: "demo" | "llm",
    seed: number,
    rated = true,
    maxPlies = 80,
  ): Match {
    const config = this.config();
    if (mode === "llm" && !config.apiKey)
      throw new Error(
        "未配置服务端 API Key。请选择规则 AI / Demo 模式，或填写 .env 后重启。",
      );
    if (this.active.size >= 2)
      throw new Error("本地同时最多运行两场比赛，请等待或取消当前比赛");
    const initial = createBattle(participants, seed, maxPlies);
    const m: Match = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      participants: structuredClone(participants),
      initial,
      state: initial,
      frames: [],
      failures: [],
      mode,
      status: "queued",
      model: mode === "llm" ? `${config.provider}/${config.model}` : undefined,
      rated,
      tokens: 0,
      settled: false,
    };
    this.store.saveMatch(m);
    return m;
  }
  async run(
    id: string,
    sides: ["demo" | "llm", "demo" | "llm"] | undefined = undefined,
  ) {
    const m = this.store.match(id);
    if (
      !m ||
      this.active.has(id) ||
      !["queued", "failed", "cancelled"].includes(m.status)
    )
      return;
    // Retry SAME immutable match. Restart engine and recorded decisions; no partial score was settled.
    if (m.status !== "queued") {
      m.state = structuredClone(m.initial);
      m.frames = [];
      m.failures = [];
      m.tokens = 0;
      m.error = undefined;
    }
    const ctrl = new AbortController();
    this.active.set(id, ctrl);
    const config = this.config();
    m.status = "running";
    this.store.saveMatch(m);
    try {
      while (m.state.status === "running") {
        if (ctrl.signal.aborted) throw new Error("用户取消比赛");
        const s = m.state,
          actor = s.active,
          c = m.participants[actor];
        let action, result, meta: DecisionMeta;
        if ((sides?.[actor] || m.mode) === "llm") {
          // Conservative reservation: bounded serialized context + output budget, twice per decision.
          const reserve = decisionReservation(s, c, config);
          if (m.tokens + reserve > config.matchTokens)
            throw new Error(
              "比赛 Token 预算不足以预留下一次决策；已停止，无规则 AI 回退。可提高 ARENA_MATCH_TOKENS。",
            );
          const decision = await decideLLM(
            s,
            c,
            { ...config, matchTokens: config.matchTokens - m.tokens },
            ctrl.signal,
          );
          ({ action, result, meta } = decision);
        } else {
          const started = performance.now();
          action = chooseDemo(s, c);
          result = applyAction(s, action);
          meta = {
            mode: "demo",
            ok: true,
            latencyMs: Math.round(performance.now() - started),
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            calls: 0,
            attempts: [
              {
                name: action.type,
                args: action,
                ok: true,
                result: JSON.stringify(result.events),
              },
            ],
          };
        }
        m.state = result.state;
        m.tokens += meta.totalTokens;
        m.frames.push({
          index: m.frames.length + 1,
          actor,
          action,
          events: result.events,
          state: result.state,
          decision: meta,
        });
        this.store.saveMatch(m);
        await yieldEventLoop();
      }
      m.status = "completed";
      this.store.saveMatch(m);
      this.store.settle(m.id);
    } catch (e) {
      if (e instanceof DecisionFailure) {
        m.tokens += e.meta.totalTokens;
        m.failures.push({
          ply: m.state.ply,
          actor: m.state.active,
          decision: e.meta,
        });
      }
      m.status = ctrl.signal.aborted ? "cancelled" : "failed";
      m.error = safeError(e, config.apiKey);
      this.store.saveMatch(m);
    } finally {
      this.active.delete(id);
    }
  }
  cancel(id: string) {
    const ctrl = this.active.get(id);
    if (!ctrl) return false;
    ctrl.abort();
    return true;
  }
}
