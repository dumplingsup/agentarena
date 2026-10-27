import "dotenv/config";
export type ModelConfig = {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  thinking: "off" | "minimal" | "low" | "medium" | "high";
  timeoutMs: number;
  maxTokens: number;
  matchTokens: number;
};
const bounded = (
  v: string | undefined,
  fallback: number,
  min: number,
  max: number,
) => {
  const n = Number(v);
  return v && Number.isFinite(n)
    ? Math.max(min, Math.min(max, Math.floor(n)))
    : fallback;
};
export function modelConfig(): ModelConfig {
  const thinking = process.env.ARENA_THINKING || "off";
  const provider = process.env.ARENA_PROVIDER || "openai";
  const envKeys: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    google: "GEMINI_API_KEY",
  };
  return {
    provider,
    model: process.env.ARENA_MODEL || "gpt-4.1-mini",
    apiKey:
      process.env.ARENA_API_KEY ||
      (envKeys[provider] ? process.env[envKeys[provider]] : "") ||
      "",
    baseUrl: process.env.ARENA_BASE_URL || undefined,
    thinking: (["off", "minimal", "low", "medium", "high"].includes(thinking)
      ? thinking
      : "off") as ModelConfig["thinking"],
    timeoutMs: bounded(process.env.ARENA_TIMEOUT_MS, 20000, 500, 60000),
    maxTokens: bounded(process.env.ARENA_MAX_TOKENS, 500, 100, 2000),
    matchTokens: bounded(process.env.ARENA_MATCH_TOKENS, 200000, 1000, 500000),
  };
}
export function publicConfig() {
  const c = modelConfig();
  return {
    configured: !!c.apiKey,
    provider: c.provider,
    model: c.model,
    thinking: c.thinking,
    timeoutMs: c.timeoutMs,
    maxTokens: c.maxTokens,
    matchTokens: c.matchTokens,
    customEndpoint: !!c.baseUrl,
  };
}
