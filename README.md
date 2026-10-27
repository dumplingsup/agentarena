# Agent Arena · 自主战士竞技场

一个可本地运行的奇幻 1v1 Agent 竞技原型。创造角色、配置能力、编辑战术、异步挑战、观看动画与逐行动回放。无需账号、数据库服务或 API Key 即可体验 Demo。

## 启动

需要 **Node.js 24.19+**（使用内置 `node:sqlite`）和 npm。Windows PowerShell / Linux 均可：

```sh
npm ci
npm run dev
```

打开 http://localhost:3000。生产预览：`npm run build`，然后 `npm start`。服务默认仅监听 `127.0.0.1`，适用于个人开发机。数据位于 `data/arena.sqlite`，重启保留角色和比赛。备份时先停止服务再复制整个 `data` 文件夹。

## 第一场比赛

1. 首页选择双方预设，保留「规则 AI / Demo」，点击「发起挑战」。
2. 服务器自动完成比赛，页面逐次播放真实结算。可暂停、单步、调整速度、拖动进度或跳到末尾。
3. 「Tool Calls」显示真实参数与执行结果；「战术复盘」统计动作和伤害；「战斗档案」重新观看历史比赛。
4. 「我的战士」复制或创建角色，调整属性、1–3 个技能和 Prompt。预算最多 24 点，非法配置不能保存。保存后的修改只影响未来比赛。

## 真实 LLM 配置

复制 `.env.example` 为 `.env`，填写服务端凭据后重启：

```dotenv
ARENA_PROVIDER=openai
ARENA_MODEL=gpt-4.1-mini
ARENA_API_KEY=你的密钥
ARENA_THINKING=off
ARENA_TIMEOUT_MS=20000
ARENA_MAX_TOKENS=500
ARENA_MATCH_TOKENS=200000
```

然后首页选择「Pi LLM Agent」。双方使用同一服务端模型和资源限制；Prompt 会实际进入各自 Pi Agent 的上下文。支持 Pi 原生 `openai`、`anthropic`、`deepseek`、`openrouter`、`google`，模型名称必须在当前安装的 Pi 模型目录内。为兼容端点或目录外模型设置 `ARENA_BASE_URL=https://你的端点/v1` 和 `ARENA_MODEL`；此时使用 Pi 的 `openai-completions` 适配器。思考等级是否可用取决于模型。只在服务器 `.env` 配置，不在浏览器填写或保存密钥。

**未配置 Key 时只有 Demo 可玩。没有声称已验证真实外部模型对战。** 已编写 Pi 实际 Agent Loop 与本地模拟 HTTP/SSE 提供商的协议测试；它们不代表真实模型质量或真实服务可用性。实际运行结果见 [测试报告](docs/TEST_REPORT.md)。模型故障、超时、无合法动作或预算不足会明确停止比赛，不会静默切换规则机器人。失败与取消比赛可在战斗页按原参赛快照重试，不会重复计分。

Token 统计使用 Pi 从提供商返回的 usage，不估造使用量；延迟在服务端实测。每场 200,000 token 是上限而非预付消耗，且为下一次决策按 UTF-8 字节保守预留输入空间，可能在接近上限时提前停止。可先将行动上限设为 40，使用便宜模型体验。工具调用最多每次决策 4 次、观察最多 2 次、模型请求最多 2 次；首次合法动作立即结束。上下文最多 64KB；超过限制明确失败。取消将中止正在运行的请求，已发生的提供商费用不会被撤销。

## 规则与模式

- 7×5 地图，曼哈顿距离，BFS 移动与 Bresenham 视线；石柱阻挡移动和射线，邻接石柱抵消 20% 远程伤害。
- 每次行动一个动作，双方交替，最多 80 次行动。结束行动回复 4 能量，防御额外回复 6 并获得 50% 减伤直至自己下次行动。
- 一瓶药剂回复 28 HP；护盾吸收伤害；禁锢阻止下一次行动的移动与位移；技能冷却按自己的行动减少，释放当次不减冷却。爆裂半径 1，会伤及自己；在敌方灼烧区域结束行动会受到伤害，可移动逃离。
- 伤害有种子控制的 ±10% 浮动。HP 归零即败；达到上限比较剩余 HP **比例**，比例相同为平局。
- **Demo** 是明确标记的启发式机器人，只读取「Demo 战术风格」，不理解自由文本 Prompt。
- **LLM** 使用 `@earendil-works/pi-agent-core` 与 `@earendil-works/pi-ai` 1.4.0，模型通过六个 JSON Schema 工具执行引擎。没有 Coding Agent、Shell、文件系统、MCP 或玩家扩展代码。
- 自由描述使用标记清晰的关键词模板映射，不使用 LLM 解析。原始设定和实际属性分开存储；种族、装备描述和职业外观不授予隐含能力。所有角色均为能力上限 Tier I，未用完预算可继续分配。
- 角色能力点与竞技 Elo 独立。Demo/LLM 分组积分，自对战不计分。历史参赛 Prompt 在玩家复盘中可见，但不发给对手 Agent；这是本地单用户原型，不是多人隐私系统。

## 开发与评测

```sh
npm run check
npm test
npm run build
npm run test:e2e
npm run evaluate -- --games=2
# 已配置 Key 后：两份不同 Prompt、相同角色/模型/种子，与相同规则对手比较
npm run evaluate -- --llm --games=1 --max-plies=30
```

E2E 优先使用本机 Edge/Chrome，没有时执行 `npx playwright install chromium`。截图在 `docs/evidence/`；Playwright 报告在 `playwright-report/`。E2E 使用独立的 `data/e2e.sqlite`。评测保存完整比赛于 `data/evaluation.sqlite`，并输出 `docs/evaluation-demo.json` / `docs/evaluation-llm.json`，包含胜率、动作和 tokens。Demo 的两份自由文本 Prompt 预期不会产生差别；只有真实 LLM 评测才能验证提示词效果，少量样本不能证明稳定优势。

架构、API、参考资料与取舍见 [开发说明](docs/ARCHITECTURE.md)。本版没有线上用户、互联网匹配、队伍、分布式队列、赛季或模型训练。下一阶段优先做真实模型的配对种子、多场策略评测与平衡调参，然后再加入持久任务队列。
