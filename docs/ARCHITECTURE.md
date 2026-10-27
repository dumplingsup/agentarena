# 实现与决定

## 边界

```
React UI ──HTTP── Express API ── MatchRunner ── Pi Agent Core
                       │              │              │
                     SQLite           └──六个战斗工具─┘
                                      │
                              shared/engine.ts
                              state + action → state + events
```

- `src/shared/model.ts`：Zod 角色/动作 Schema、预设、技能原语、预算、快照和事件类型。
- `src/shared/engine.ts`：不依赖模型、时钟、数据库或外部随机数的纯状态转换；内部 LCG 随机状态随快照保存。
- `src/shared/bot.ts`：显式风格参数驱动的启发式基准，非 LLM。可以直接在无网络环境下完成比赛。
- `src/server/runtime.ts`：Pi 1.4.0 的 `Agent`，六个游戏工具的 TypeBox JSON Schema。工具调用直接执行纯引擎，成功只允许一个动作。引擎和 Schema 双重验证。
- `src/server/matches.ts`：后台异步作业、取消、预算、重试、事件与状态持久化。进程内任务调度接口独立，可替换持久队列。
- `src/server/store.ts`：内置 SQLite/WAL，无额外服务，参赛配置深拷贝。Elo 和结算标记在同一事务写入。不同运行模式分榜。
- `src/client`：React/SVG/CSS，动作日志和状态驱动动画及历史回放。美术均为本项目原创向量绘制；不包含 Eslabong 版权素材。

每次决策新建一个有独立上下文的 Pi Agent，输入固定规则、自己的身份与 Prompt、公开战场和合法动作列表。当前 MVP 不保留跨回合对话或模型私有记忆，以降低成本与上下文污染。敌人的 Prompt、背景、原始设定不进入公开观察。战场位置与战斗属性为公开信息。本地玩家可查看自己库中所有角色和比赛快照；未来多人服务需要独立授权和脱敏视图。

## 预算、安全和失败

角色的数值上限由 Zod、24 点预算和白名单技能验证。免费文字只表达故事和战术；不能修改规则。工具不会执行任意代码，不能访问任何开发环境工具。LLM 的自由意图文本由 React 作为普通文本渲染。模型失败停止比赛、保存失败尝试及 usage，不使用规则机器人冒充模型。每次请求输出受 maxTokens 约束；单次决策两次请求、四次工具尝试、两次观察、64KB 上下文与硬超时。提供商忽略取消时硬截止仍能阻止迟到工具执行。工具 SDK 内部重试仍受截止时间约束。

每次决策前按 UTF-8 字节数保守预留两次模型输入/输出与工具结果空间，实际用量按提供商 usage 累加。这是原型的 token 上限，不是精确美元预算；不同提供商 tokenization、上下文限制与费用仍需真实接入校准。API 不返回 Key，错误过滤当前 Key 与 Bearer 内容，默认仅监听回环地址，同源校验防止普通第三方网页触发付费请求。多人认证、网络端点管理和生产部署加固未做。

## 比赛、重试与回放

比赛保存 `rules` 版本、seed、immutable participants、initial、实际 `frames`、工具尝试及每帧 state。完整回放依赖实际动作序列；同 seed 不保证外部 LLM 决策一致。UI 读取记录，测试重执行所有动作验证与事件/快照一致。规则未来改变需保留老版本执行器，当前仅支持 1.0。参赛快照仅由服务器创建，无更新 API。规则模块不执行玩家代码。

SQLite `matches.settled` 在 `BEGIN IMMEDIATE` 内检查并与两方 Elo 一起提交。已完成比赛不可重跑，失败/取消无积分。原比赛 ID 重试会从相同参赛快照和种子重新运行，替换失败尝试（旧失败尝试不另存），最后只结算一次。服务重启将未完成作业标为失败，由用户手动重试；当前没有断点续跑。比赛创建后即使关闭浏览器，服务器继续执行。内存并发上限两场；无生产队列和跨进程锁。

## HTTP API

| API                                         | 用途                                              |
| ------------------------------------------- | ------------------------------------------------- |
| `GET /api/config`                           | 不含 Key 的服务端状态与限额                       |
| `GET /api/characters`, `GET /api/presets`   | 本地角色与初始模板                                |
| `POST /api/characters`                      | 严格验证后创建/更新版本                           |
| `POST /api/characters/:id/copy`             | 独立 ID 的复制                                    |
| `POST /api/matches`                         | left/right/mode/seed/maxPlies，返回 202，后台执行 |
| `GET /api/matches`, `GET /api/matches/:id`  | 历史摘要与完整动作/状态记录                       |
| `POST /api/matches/:id/cancel`, `.../retry` | 取消或按原快照重试                                |
| `GET /api/standings?mode=demo\|llm`         | 分模式本地 Elo                                    |

## 定向调研

2026-10-26 检查官方文档、npm 包与实际声明，锁定安装的 Pi 1.4.0。参考重点是规则/决策分离，而非复制整套基础设施：

- [Pi 官方 SDK](https://pi.dev/docs/latest/sdk)、[Agent Core 官方实现与 README](https://github.com/earendil-works/pi/tree/main/packages/agent)：选择底层 `Agent`，放弃有资源发现与开发工具的 Coding Agent；实际类型使用 `streamFn`、`finishTurn`、工具结果 `terminate`、独立 TypeBox `typebox` 包。文档示例曾发生变化，代码以安装包 `.d.ts` 为准。
- [PokéArena](https://github.com/shaumik/PokeArena)：参考确定性引擎、合法动作错误反馈、工具驱动、记录与重放、基准机器人。这些设计迁移为纯规则模块与实际动作序列；未复制 Go/MCP/分布式基础设施。
- [Age of Agents](https://github.com/thebrownproject/age-of-agents)：参考公开观察转为 JSON、模型发令与引擎执行分离；本项目将凭据放服务端。
- 本机 `D:\GameDevReference\Eslabong\资源索引.md` 与 `README.md`：核查佣兵/场景/素材分类和许可说明。原始资源为 Godot 容器、授权各异，首版使用原创 SVG，未转换或分发其代码/贴图。复用方向保留为后续有授权的外观资源接入。

## 后续优先级

先完成真实模型的两策略配对实验（相同模型/角色/种子，交换先手、多次独立采样），保存失败率、花费和动作分布；再验证技能平衡。之后才引入耐久作业队列、版本化回放执行器、角色外观资源、共享匹配和用户系统。
