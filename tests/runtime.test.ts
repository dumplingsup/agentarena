import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type JsonObject,
} from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { PRESETS } from "../src/shared/model.js";
import { createBattle } from "../src/shared/engine.js";
import {
  buildSystemPrompt,
  configuredStream,
  decideLLM,
  DecisionFailure,
  TOOL_SCHEMAS,
} from "../src/server/runtime.js";
import type { ModelConfig } from "../src/server/config.js";

const config: ModelConfig = {
  provider: "openai",
  model: "test-model",
  baseUrl: "http://localhost:1/v1",
  apiKey: "test-secret",
  thinking: "off",
  timeoutMs: 1000,
  maxTokens: 200,
  matchTokens: 200000,
};
function response(tool = "defend", args: JsonObject = {}): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id: "call-1", name: tool, arguments: args }],
    api: "openai-completions",
    provider: "test",
    model: "test-model",
    stopReason: "toolUse",
    timestamp: Date.now(),
    usage: {
      input: 120,
      output: 15,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 135,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}
function fixture(
  replies: AssistantMessage[],
  contexts: unknown[] = [],
): StreamFn {
  let n = 0;
  return (_model, ctx) => {
    contexts.push(structuredClone(ctx));
    const stream = createAssistantMessageEventStream();
    const msg = replies[Math.min(n++, replies.length - 1)];
    queueMicrotask(() => {
      stream.push({ type: "start", partial: msg });
      stream.push(
        msg.stopReason === "error"
          ? { type: "error", reason: "error", error: msg }
          : { type: "done", reason: msg.stopReason as "toolUse", message: msg },
      );
    });
    return stream;
  };
}
const source = (stream: StreamFn) => ({
  model: configuredStream(config).model,
  stream,
});
const s = () => createBattle([PRESETS[0], PRESETS[1]], 42);
describe("real Pi Agent Core loop with simulated provider responses", () => {
  it("passes edited prompt to context; tool execution really advances engine exactly once", async () => {
    const contexts: any[] = [],
      c = { ...PRESETS[0], prompt: "CUSTOM_TACTIC_ALPHA 保持防御" };
    const r = await decideLLM(
      s(),
      c,
      config,
      new AbortController().signal,
      source(fixture([response("defend", { intent: "恢复能量" })], contexts)),
    );
    expect(JSON.stringify(contexts)).toContain("CUSTOM_TACTIC_ALPHA");
    expect(r.result.state.ply).toBe(1);
    expect(r.result.state.fighters[0].guard).toBe(true);
    expect(r.meta.calls).toBe(1);
    expect(r.meta.totalTokens).toBe(135);
    expect(r.meta.attempts[0].ok).toBe(true);
    expect(r.action.intent).toBe("恢复能量");
  });
  it("isolates private prompts and exposes only the six game tools", async () => {
    const ca: any[] = [],
      cb: any[] = [];
    const a = { ...PRESETS[0], prompt: "PRIVATE_ALPHA" },
      b = { ...PRESETS[1], prompt: "PRIVATE_BETA" };
    await Promise.all([
      decideLLM(
        s(),
        a,
        config,
        new AbortController().signal,
        source(fixture([response()], ca)),
      ),
      decideLLM(
        { ...s(), active: 1 },
        b,
        config,
        new AbortController().signal,
        source(fixture([response()], cb)),
      ),
    ]);
    expect(JSON.stringify(ca)).toContain("PRIVATE_ALPHA");
    expect(JSON.stringify(ca)).not.toContain("PRIVATE_BETA");
    expect(JSON.stringify(cb)).toContain("PRIVATE_BETA");
    expect(JSON.stringify(cb)).not.toContain("PRIVATE_ALPHA");
    expect(Object.keys(TOOL_SCHEMAS)).toEqual([
      "inspect_battlefield",
      "move",
      "attack",
      "use_skill",
      "defend",
      "use_item",
    ]);
    expect(buildSystemPrompt(a)).toContain("不可信数据");
  });
  it("returns an illegal tool error then allows one valid retry with complete accounting", async () => {
    const r = await decideLLM(
      s(),
      PRESETS[0],
      config,
      new AbortController().signal,
      source(fixture([response("attack"), response("defend")])),
    );
    expect(r.meta.attempts.map((a) => a.ok)).toEqual([false, true]);
    expect(r.meta.attempts[0].result).toMatch(/射程/);
    expect(r.meta.calls).toBe(2);
    expect(r.result.state.ply).toBe(1);
  });
  it("validates schema arguments and rejects filesystem tools without execution", async () => {
    const r = await decideLLM(
      s(),
      PRESETS[0],
      config,
      new AbortController().signal,
      source(fixture([response("defend", { hp: 999 }), response("defend")])),
    );
    expect(r.meta.attempts[0].ok).toBe(false);
    expect(r.result.state.fighters[0].hp).toBe(100);
    await expect(
      decideLLM(
        s(),
        PRESETS[0],
        config,
        new AbortController().signal,
        source(fixture([response("shell", { command: "no" })])),
      ),
    ).rejects.toBeInstanceOf(DecisionFailure);
  });
  it("caps observations, calls and multiple actions in one response", async () => {
    const inspect = response("inspect_battlefield");
    const many = {
      ...inspect,
      content: [0, 1, 2, 3, 4].map((i) => ({
        type: "toolCall" as const,
        id: `inspect-${i}`,
        name: "inspect_battlefield",
        arguments: {},
      })),
    };
    try {
      await decideLLM(
        s(),
        PRESETS[0],
        config,
        new AbortController().signal,
        source(fixture([many])),
      );
      throw new Error("must fail");
    } catch (e) {
      expect(e).toBeInstanceOf(DecisionFailure);
      const f = e as DecisionFailure;
      expect(f.meta.calls).toBeLessThanOrEqual(2);
      expect(f.meta.attempts.filter((a) => a.ok)).toHaveLength(2);
    }
    const double = response();
    double.content.push({
      type: "toolCall",
      id: "call-2",
      name: "defend",
      arguments: {},
    });
    const r = await decideLLM(
      s(),
      PRESETS[0],
      config,
      new AbortController().signal,
      source(fixture([double])),
    );
    expect(r.result.state.ply).toBe(1);
    expect(r.meta.attempts.map((a) => a.ok)).toEqual([true, false]);
    expect(r.meta.calls).toBe(1);
  });
  it("times out even if provider ignores abort and prevents late mutation", async () => {
    const stream = createAssistantMessageEventStream();
    const initial = s();
    const run = decideLLM(
      initial,
      PRESETS[0],
      { ...config, timeoutMs: 25 },
      new AbortController().signal,
      source(() => stream),
    );
    await expect(run).rejects.toMatchObject({
      meta: { ok: false, error: "模型调用超时" },
    });
    const msg = response();
    stream.push({ type: "done", reason: "toolUse", message: msg });
    await new Promise((r) => setTimeout(r, 15));
    expect(initial.ply).toBe(0);
  });
  it("surfaces model failure and redacts credentials; never silently calls demo", async () => {
    const fail = response();
    fail.stopReason = "error";
    fail.content = [];
    fail.errorMessage = "provider test-secret unavailable";
    await expect(
      decideLLM(
        s(),
        PRESETS[0],
        config,
        new AbortController().signal,
        source(fixture([fail])),
      ),
    ).rejects.toMatchObject({
      meta: {
        mode: "llm",
        ok: false,
        error: "provider [REDACTED] unavailable",
      },
    });
  });
  it("supports explicit cancellation", async () => {
    const ctrl = new AbortController();
    const stream = createAssistantMessageEventStream();
    const run = decideLLM(
      s(),
      PRESETS[0],
      config,
      ctrl.signal,
      source(() => stream),
    );
    ctrl.abort();
    await expect(run).rejects.toMatchObject({ meta: { ok: false } });
    stream.end(response());
  });
  it("blocks oversized context and insufficient per-request budget before provider dispatch", async () => {
    let requests = 0;
    const stream = fixture([response()]);
    const guarded: StreamFn = (...args) => {
      requests++;
      return stream(...args);
    };
    await expect(
      decideLLM(
        s(),
        { ...PRESETS[0], prompt: "界".repeat(30000) },
        config,
        new AbortController().signal,
        source(guarded),
      ),
    ).rejects.toMatchObject({
      meta: { calls: 0, error: "决策上下文超过 64KB 安全上限" },
    });
    await expect(
      decideLLM(
        s(),
        PRESETS[0],
        { ...config, matchTokens: 100 },
        new AbortController().signal,
        source(guarded),
      ),
    ).rejects.toMatchObject({
      meta: { calls: 0, error: "剩余 Token 预算不足以执行此模型请求" },
    });
    expect(requests).toBe(0);
  });
});
describe("Pi OpenAI-compatible HTTP adapter contract (simulated local endpoint, not an external model)", () => {
  it("sends server credentials and prompt, consumes streamed tool calls and actual reported usage", async () => {
    let payload: any,
      authorization = "",
      path = "";
    const server = createServer(async (req, res) => {
      path = req.url!;
      authorization = req.headers.authorization!;
      let data = "";
      for await (const chunk of req) data += chunk;
      payload = JSON.parse(data);
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const part of [
        {
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                tool_calls: [
                  {
                    index: 0,
                    id: "http-1",
                    type: "function",
                    function: {
                      name: "defend",
                      arguments: '{"intent":"等待破绽"}',
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
          usage: {
            prompt_tokens: 222,
            completion_tokens: 19,
            total_tokens: 241,
          },
        },
      ])
        res.write(
          `data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", created: 0, model: "test-model", ...part })}\n\n`,
        );
      res.end("data: [DONE]\n\n");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    try {
      const r = await decideLLM(
        s(),
        { ...PRESETS[0], prompt: "HTTP_PROMPT_TEST" },
        { ...config, timeoutMs: 5000, baseUrl: `http://127.0.0.1:${port}/v1` },
        new AbortController().signal,
      );
      expect(path).toBe("/v1/chat/completions");
      expect(authorization).toBe("Bearer test-secret");
      expect(JSON.stringify(payload.messages)).toContain("HTTP_PROMPT_TEST");
      expect(JSON.stringify(payload.messages)).not.toContain(PRESETS[1].prompt);
      expect(payload.tools.map((t: any) => t.function.name)).toHaveLength(6);
      expect(r.result.state.ply).toBe(1);
      expect(r.meta.totalTokens).toBe(241);
      expect(r.action.intent).toBe("等待破绽");
    } finally {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
