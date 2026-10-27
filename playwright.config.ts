import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const browser = [
  process.env.PLAYWRIGHT_EXECUTABLE,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].find((p) => p && existsSync(p));
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 1080 },
    launchOptions: { executablePath: browser },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node --import tsx src/server/index.ts",
    url: "http://127.0.0.1:3100/api/config",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      PORT: "3100",
      ARENA_DB: "data/e2e.sqlite",
      ARENA_API_KEY: "",
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
    },
  },
});
