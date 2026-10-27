import { useEffect, useRef, useState } from "react";
import {
  BUDGET,
  CLASS_NAMES,
  CLASSES,
  PRESETS,
  SKILLS,
  characterSchema,
  points,
  type Action,
  type BattleState,
  type Character,
  type Fighter,
  type Frame,
  type Match,
  type Standing,
  type Stats,
} from "../shared/model";
import { createBattle, distance } from "../shared/engine";
import { BrandMark, Warrior } from "./art";

async function api<T>(path: string, data?: unknown): Promise<T> {
  const r = await fetch(
    `/api/${path}`,
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || "请求失败");
  return body;
}
type Config = {
  configured: boolean;
  provider: string;
  model: string;
  thinking: string;
  timeoutMs: number;
  maxTokens: number;
  matchTokens: number;
  customEndpoint: boolean;
};
const styleNames = {
  aggressive: "激进突袭",
  balanced: "攻守均衡",
  cautious: "谨慎拉扯",
};
const actionName = (a: Action) =>
  a.type === "use_skill"
    ? SKILLS[a.skillId].name
    : {
        move: "移动",
        attack: "普通攻击",
        defend: "防御回能",
        use_item: "使用药剂",
      }[a.type];
const colorFor = (i: number) => (i === 0 ? "#b3d6c1" : "#cfaa91");
const date = (v: string) =>
  new Date(v).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
function Meter({
  value,
  max,
  energy = false,
}: {
  value: number;
  max: number;
  energy?: boolean;
}) {
  return (
    <div className={`meter ${energy ? "energy" : ""}`}>
      <span style={{ width: `${Math.max(0, (value / max) * 100)}%` }} />
    </div>
  );
}
function FighterPanel({
  f,
  index,
  active,
}: {
  f: Fighter;
  index: number;
  active: boolean;
}) {
  return (
    <div className={`fighter-panel ${active ? "active" : ""}`}>
      <div className="fighter-mini">
        <Warrior kind={f.classId} color={colorFor(index)} />
      </div>
      <div className="fighter-detail">
        <div className="fighter-name">
          <b>{f.name}</b>
          <span className={`team team-${index}`}>
            {index ? "挑战对手" : "你的战士"}
          </span>
        </div>
        <div className="meter-label">
          <span>生命</span>
          <strong>
            {f.hp} <small>/ {f.stats.hp}</small>
          </strong>
        </div>
        <Meter value={f.hp} max={f.stats.hp} />
        <div className="meter-label">
          <span>能量</span>
          <span>
            {f.energy} / {f.stats.energy}
          </span>
        </div>
        <Meter value={f.energy} max={f.stats.energy} energy />
        <div className="status-row">
          <span>◈ 护盾 {f.shield}</span>
          <span>✚ 药剂 {f.potion}</span>
          {f.guard && <span className="mint">防御中</span>}
          {!!f.root && <span className="blue">禁锢</span>}
        </div>
        <div className="cooldowns">
          {f.skills.map((k) => (
            <span key={k} title={SKILLS[k].description}>
              {SKILLS[k].name}
              <b>{f.cooldowns[k] ? `${f.cooldowns[k]} CD` : "就绪"}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
function Board({
  state,
  frame,
  preview = false,
}: {
  state: BattleState;
  frame?: Frame;
  preview?: boolean;
}) {
  return (
    <div className={`board-shell ${preview ? "preview" : ""}`}>
      <div className="arena-arch">
        <span>✦</span>
        <div>
          <b>灰烬竞技场</b>
          <small>THE ASHEN GROUNDS</small>
        </div>
        <span>✦</span>
      </div>
      <div className="board-coordinate">
        <span>01</span>
        <span>02</span>
        <span>03</span>
        <span>04</span>
        <span>05</span>
        <span>06</span>
        <span>07</span>
      </div>
      <div className="board" data-testid="battlefield" aria-label="7乘5竞技场">
        {Array.from({ length: 35 }, (_, i) => {
          const x = i % 7,
            y = Math.floor(i / 7),
            block = state.obstacles.some((p) => p.x === x && p.y === y),
            hazard = state.hazards.some((p) => p.x === x && p.y === y);
          return (
            <div
              className={`tile ${(x + y) % 2 ? "odd" : ""} ${block ? "blocked" : ""} ${hazard ? "hazard" : ""}`}
              key={i}
              title={`(${x}, ${y})${block ? " 石柱：阻挡移动与视线；邻接提供远程掩护" : hazard ? " 灼烧区域" : ""}`}
            >
              {block && (
                <svg viewBox="0 0 80 80" className="pillar">
                  <path
                    d="m17 56 23 12 24-12V29L40 17 17 29Z"
                    fill="#515d4d"
                    stroke="#242e27"
                    strokeWidth="2"
                  />
                  <path d="m17 29 23 13 24-13-24-12Z" fill="#72816b" />
                  <path
                    d="M40 42v26m-17-2 17 9 20-10"
                    stroke="#303f30"
                    strokeWidth="3"
                  />
                  <path
                    d="m24 27 16 8 17-8M25 46l7 3m15-1 9-5"
                    stroke="#8b9879"
                    opacity=".4"
                    strokeWidth="2"
                  />
                </svg>
              )}
              {!block && <span className="tile-dot">·</span>}
            </div>
          );
        })}
        {state.fighters.map((f, i) => (
          <div
            key={i}
            className={`pawn team-${i} ${f.hp <= 0 ? "fallen" : ""} ${frame?.actor === i && (frame.action.type === "attack" || frame.action.type === "use_skill") ? "acting" : ""}`}
            style={{ left: `${(f.x / 7) * 100}%`, top: `${(f.y / 5) * 100}%` }}
          >
            <div className={`pawn-ring ${state.active === i ? "turn" : ""}`} />
            <Warrior kind={f.classId} color={colorFor(i)} flip={i === 1} />
            <div className="pawn-hp">
              <span style={{ width: `${(f.hp / f.stats.hp) * 100}%` }} />
            </div>
            <span className="pawn-label">{f.name.split(" · ")[0]}</span>
            {frame?.events
              .filter(
                (e) =>
                  e.target === i && (e.kind === "damage" || e.kind === "heal"),
              )
              .map((e, n) => (
                <span
                  key={`${frame.index}-${n}`}
                  className={`floating ${e.kind === "heal" ? "positive" : ""}`}
                >
                  {e.kind === "heal" ? "+" : "−"}
                  {e.amount}
                </span>
              ))}
          </div>
        ))}
        {frame?.action.type === "use_skill" && (
          <div
            key={frame.index}
            className={`cast-effect ${frame.action.skillId}`}
          />
        )}
      </div>
      <div className="board-footer">
        <span>
          <i className="legend-dot" /> 青方战士{" "}
          <i className="legend-dot rust" /> 红方战士
        </span>
        <span>
          ▧ 石柱 / 掩体 <span className="hazard-label">♨ 灼烧</span>
        </span>
      </div>
    </div>
  );
}

export function App() {
  const [tab, setTab] = useState<"arena" | "agents" | "history">("arena");
  const [chars, setChars] = useState<Character[]>([]),
    [history, setHistory] = useState<Match[]>([]),
    [standings, setStandings] = useState<Standing[]>([]);
  const [config, setConfig] = useState<Config>();
  const [left, setLeft] = useState("knight"),
    [right, setRight] = useState("ranger"),
    [mode, setMode] = useState<"demo" | "llm">("demo");
  const [seed, setSeed] = useState(42),
    [maxPlies, setMaxPlies] = useState(80);
  const [match, setMatch] = useState<Match>(),
    [cursor, setCursor] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);
  const [editor, setEditor] = useState<Character>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [showConfig, setShowConfig] = useState(false);
  const [logTab, setLogTab] = useState<"timeline" | "tools" | "review">(
    "timeline",
  );
  const logRef = useRef<HTMLDivElement>(null);
  const refresh = async () => {
    const [c, h, s, cfg] = await Promise.all([
      api<Character[]>("characters"),
      api<Match[]>("matches"),
      api<Standing[]>(`standings?mode=${mode}`),
      api<Config>("config"),
    ]);
    setChars(c);
    setHistory(h);
    setStandings(s);
    setConfig(cfg);
  };
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [mode]);
  useEffect(() => {
    if (!match || !["queued", "running"].includes(match.status)) return;
    let cancelled = false;
    const timer = setInterval(() => {
      api<Match>(`matches/${match.id}`)
        .then((m) => {
          if (!cancelled) {
            setMatch(m);
            if (!["queued", "running"].includes(m.status))
              refresh().catch(() => {});
          }
        })
        .catch((e) => setError(e.message));
    }, 400);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [match?.id, match?.status]);
  useEffect(() => {
    if (!playing || !match) return;
    const timer = setInterval(
      () =>
        setCursor((i) => {
          if (i >= match.frames.length) {
            if (!["queued", "running"].includes(match.status))
              setPlaying(false);
            return i;
          }
          return i + 1;
        }),
      850 / speed,
    );
    return () => clearInterval(timer);
  }, [playing, speed, match?.frames.length, match?.status]);
  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [cursor]);
  const selectedLeft = chars.find((c) => c.id === left) || PRESETS[0],
    selectedRight = chars.find((c) => c.id === right) || PRESETS[1];
  const state = match
    ? cursor > 0
      ? match.frames[Math.min(cursor, match.frames.length) - 1]?.state ||
        match.initial
      : match.initial
    : createBattle([selectedLeft, selectedRight], seed);
  const frame = match?.frames[cursor - 1];
  const ended =
    match &&
    cursor >= match.frames.length &&
    !["running", "queued"].includes(match.status);
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const m = await api<Match>("matches", {
        left,
        right,
        mode,
        seed,
        maxPlies,
      });
      setMatch(m);
      setCursor(0);
      setPlaying(true);
      setTab("arena");
      setLogTab("timeline");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const openMatch = async (id: string) => {
    try {
      setMatch(await api<Match>(`matches/${id}`));
      setCursor(0);
      setPlaying(false);
      setTab("arena");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const copy = async (c: Character) => {
    try {
      const n = await api<Character>(`characters/${c.id}/copy`, {});
      await refresh();
      setEditor(n);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const save = async (c: Character) => {
    const result = await api<Character>("characters", c);
    await refresh();
    setLeft(result.id);
    setEditor(undefined);
    setNotice("角色与战术已保存。下一场比赛将使用新版本。");
    setTab("agents");
  };
  const navigate = (v: typeof tab) => {
    setTab(v);
    setEditor(undefined);
  };
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("arena");
          }}
        >
          <BrandMark />
          <span>
            AGENT<span>ARENA</span>
          </span>
        </a>
        <div className="season">
          LOCAL SEASON <b>01</b>
        </div>
        <div className="nav-caption">你的竞技场</div>
        <nav>
          {(
            [
              ["arena", "⚔", "竞技场"],
              ["agents", "♜", "我的战士"],
              ["history", "◷", "战斗档案"],
            ] as const
          ).map(([id, icon, name]) => (
            <button
              key={id}
              className={tab === id && !editor ? "selected" : ""}
              onClick={() => navigate(id)}
            >
              <span className="nav-icon">{icon}</span>
              {name}
              {id === "agents" && <small>{chars.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span>✧</span>
          <p>
            你创造战士。
            <br />
            Agent 决定如何战斗。
          </p>
        </div>
        <div className="sidebar-bottom">
          <span className="online-dot" /> 本地竞技场在线
          <button onClick={() => setShowConfig(!showConfig)}>
            模型连接 <span>↗</span>
          </button>
          <small>PROTOTYPE v0.1 · ENGINE 1.0</small>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            独立 Agent 竞技场 <span className="slash">/</span>{" "}
            {editor
              ? "战士工坊"
              : {
                  arena: match ? "观战与复盘" : "灰烬竞技场",
                  agents: "我的战士",
                  history: "战斗档案",
                }[tab]}
          </span>
          <div>
            <span className="local-tag">LOCAL MVP</span>
            <button
              className="avatar"
              onClick={() => navigate("agents")}
              aria-label="打开我的战士"
            >
              A
            </button>
          </div>
        </header>
        <div className="content">
          {error && (
            <div role="alert" className="alert error">
              {error}
              <button onClick={() => setError("")}>×</button>
            </div>
          )}
          {notice && (
            <div role="status" className="alert notice">
              {notice}
              <button onClick={() => setNotice("")}>×</button>
            </div>
          )}
          {showConfig && (
            <section className="config-panel">
              <div>
                <span className="eyebrow">MODEL CONNECTION</span>
                <h2>服务端模型连接</h2>
                <p>
                  {config?.configured
                    ? `已配置 ${config.provider} / ${config.model}`
                    : "尚未配置 API Key · Demo 可以立即游玩"}
                </p>
              </div>
              <p>
                复制 <code>.env.example</code> 为 <code>.env</code>，填写{" "}
                <code>ARENA_API_KEY</code>、提供商、模型和可选 Base URL
                后重启。密钥只由服务端读取。
              </p>
              <div className="config-values">
                超时 {config?.timeoutMs} ms · 每次输出 {config?.maxTokens}{" "}
                tokens · 每场上限 {config?.matchTokens} tokens · 思考{" "}
                {config?.thinking}
              </div>
              <button
                className="secondary"
                onClick={() => setShowConfig(false)}
              >
                关闭
              </button>
            </section>
          )}
          {editor ? (
            <Editor
              key={editor.id}
              character={editor}
              onSave={save}
              onCancel={() => setEditor(undefined)}
            />
          ) : tab === "arena" ? (
            <>
              {!match ? (
                <>
                  <section className="hero">
                    <div className="hero-copy">
                      <span className="eyebrow">
                        <span className="online-dot" /> 自主战斗 · 由你定义
                      </span>
                      <h1>
                        创造战士。
                        <br />让<span>策略</span>决定胜负。
                      </h1>
                      <p>
                        写下角色的故事，塑造它的战术。
                        <br />
                        走进竞技场，看你的 Agent 自主决策、交锋与成长。
                      </p>
                      <div className="hero-buttons">
                        <button
                          className="primary"
                          onClick={start}
                          disabled={busy}
                        >
                          ⚔ 开始第一场对决 <span>↗</span>
                        </button>
                        <button
                          className="text-button"
                          onClick={() => {
                            setEditor({
                              ...structuredClone(PRESETS[0]),
                              id: "",
                              name: "我的战士",
                            });
                          }}
                        >
                          创造战士 →
                        </button>
                      </div>
                      <div className="hero-foot">
                        <span>01 / 定义角色</span>
                        <span>02 / 编写战术</span>
                        <span>03 / 见证交锋</span>
                      </div>
                    </div>
                    <div className="hero-arena">
                      <div className="arena-live">
                        <span className="online-dot" /> 战场预览{" "}
                        <span>7 × 5 TACTICAL GRID</span>
                      </div>
                      <Board state={state} preview />
                      <div className="preview-label">
                        <span>{selectedLeft.name}</span>
                        <b>VS</b>
                        <span>{selectedRight.name}</span>
                      </div>
                    </div>
                  </section>
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">ENTER THE ARENA</span>
                      <h2>准备你的下一场对决</h2>
                    </div>
                    <span className="subtle">
                      异步挑战 · 本地保存 · 随时回放
                    </span>
                  </div>
                  <section className="prep">
                    <div className="match-selection">
                      <label>
                        01 / 你的战士
                        <select
                          aria-label="己方角色"
                          value={left}
                          onChange={(e) => setLeft(e.target.value)}
                        >
                          {chars.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} · {CLASS_NAMES[c.classId]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <span className="versus">VS</span>
                      <label>
                        02 / 挑战对手
                        <select
                          aria-label="对手角色"
                          value={right}
                          onChange={(e) => setRight(e.target.value)}
                        >
                          {chars.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} · {CLASS_NAMES[c.classId]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="prep-bottom">
                      <div className="mode-control">
                        <button
                          className={mode === "demo" ? "chosen" : ""}
                          onClick={() => setMode("demo")}
                        >
                          ◈ 规则 AI / Demo
                        </button>
                        <button
                          className={mode === "llm" ? "chosen" : ""}
                          onClick={() => setMode("llm")}
                        >
                          ✦ Pi LLM Agent
                        </button>
                      </div>
                      <label className="seed-label">
                        种子{" "}
                        <input
                          aria-label="随机种子"
                          type="number"
                          min={0}
                          max={4294967295}
                          value={seed}
                          onChange={(e) => setSeed(Number(e.target.value))}
                        />
                      </label>
                      <label className="seed-label">
                        行动上限{" "}
                        <select
                          aria-label="行动上限"
                          value={maxPlies}
                          onChange={(e) => setMaxPlies(+e.target.value)}
                        >
                          <option>40</option>
                          <option>60</option>
                          <option>80</option>
                        </select>
                      </label>
                      <button
                        className="primary"
                        onClick={start}
                        disabled={busy}
                      >
                        {busy ? "准备中…" : "发起挑战"} →
                      </button>
                    </div>
                    <p className="mode-note">
                      {mode === "demo"
                        ? "无需 API。启发式机器人根据战术风格行动；自由文本 Prompt 不在此模式解析。"
                        : `真实模型自主调用工具；双方使用相同服务端模型。${config?.configured ? `当前：${config.provider}/${config.model}` : "尚未配置 API Key，点击左下角「模型连接」查看配置。"}`}
                    </p>
                  </section>
                  <Roster
                    chars={chars.slice(0, 4)}
                    standings={standings}
                    onEdit={setEditor}
                    onCopy={copy}
                    onNew={() => navigate("agents")}
                    compact
                  />
                </>
              ) : (
                <>
                  <div className="section-heading battle-heading">
                    <div>
                      <button
                        className="back-link"
                        onClick={() => {
                          setMatch(undefined);
                          setPlaying(false);
                        }}
                      >
                        ← 返回对战准备
                      </button>
                      <h1>
                        灰烬中的交锋{" "}
                        <span className={`badge ${match.mode}`}>
                          {match.mode === "demo"
                            ? "规则 AI / Demo"
                            : "Pi LLM Agent"}
                        </span>
                      </h1>
                      <p className="subtle">
                        参赛快照 v{match.participants[0].version} / v
                        {match.participants[1].version} · 种子{" "}
                        {match.initial.seed} ·{" "}
                        {match.model || "本地启发式基准机器人"}
                      </p>
                    </div>
                    <div className="round-counter">
                      <span>行动</span>
                      <b>{cursor.toString().padStart(2, "0")}</b>
                      <small>/ {match.initial.maxPlies}</small>
                    </div>
                  </div>
                  <div className="combat-status" aria-live="polite">
                    {ended ? (
                      match.status === "completed" ? (
                        <>
                          <span className="mint">✦ 比赛结束</span>{" "}
                          {state.winner === null
                            ? "双方平局"
                            : `${state.fighters[state.winner].name} 获胜`}
                          <small>{state.reason}</small>
                        </>
                      ) : (
                        <>
                          <span className="danger">
                            {match.status === "cancelled"
                              ? "比赛已取消"
                              : "模型 / 比赛失败"}
                          </span>{" "}
                          {match.error}
                        </>
                      )
                    ) : (
                      <>
                        <span className="online-dot" />{" "}
                        {playing ? "观战进行中" : "回放已暂停"}{" "}
                        <span className="subtle">
                          {state.fighters[state.active].name} 准备行动
                        </span>
                        {match.status === "running" && (
                          <small>服务器独立结算中…</small>
                        )}
                      </>
                    )}
                  </div>
                  <div className="battle-layout">
                    <div className="battle-main">
                      <Board state={state} frame={frame} />
                      <div className="playback">
                        <button
                          className="secondary square"
                          aria-label="回到开始"
                          onClick={() => {
                            setCursor(0);
                            setPlaying(false);
                          }}
                        >
                          ↤
                        </button>
                        <button
                          className="primary play-button"
                          onClick={() => {
                            if (ended && cursor > 0) setCursor(0);
                            setPlaying(!playing);
                          }}
                        >
                          {playing ? "Ⅱ 暂停" : "▶ 播放"}
                        </button>
                        <button
                          className="secondary square"
                          aria-label="下一步"
                          onClick={() => {
                            setPlaying(false);
                            setCursor((i) =>
                              Math.min(i + 1, match.frames.length),
                            );
                          }}
                        >
                          →
                        </button>
                        <input
                          aria-label="回放进度"
                          type="range"
                          min="0"
                          max={Math.max(1, match.frames.length)}
                          value={cursor}
                          onChange={(e) => {
                            setPlaying(false);
                            setCursor(+e.target.value);
                          }}
                        />
                        <select
                          aria-label="播放速度"
                          value={speed}
                          onChange={(e) => setSpeed(+e.target.value)}
                        >
                          <option value="0.5">0.5×</option>
                          <option value="1">1×</option>
                          <option value="2">2×</option>
                          <option value="4">4×</option>
                        </select>
                        <button
                          className="text-button"
                          onClick={() => {
                            setCursor(match.frames.length);
                            setPlaying(false);
                          }}
                        >
                          末尾 ↦
                        </button>
                      </div>
                    </div>
                    <aside className="battle-side">
                      {state.fighters.map((f, i) => (
                        <FighterPanel
                          key={i}
                          f={f}
                          index={i}
                          active={
                            state.active === i && state.status === "running"
                          }
                        />
                      ))}
                      <div className="decision-card">
                        <span className="eyebrow">AGENT INTENT</span>
                        <p>
                          {frame?.action.intent || "等待战士做出第一个决策。"}
                        </p>
                        <small>
                          {frame
                            ? `${frame.decision.mode === "demo" ? "规则决策" : frame.decision.ok ? "模型调用成功" : "模型调用失败"} · ${frame.decision.latencyMs} ms · ${frame.decision.totalTokens} tokens`
                            : "行动意图来自已记录的工具参数"}
                        </small>
                      </div>
                      {["queued", "running"].includes(match.status) && (
                        <button
                          className="secondary"
                          onClick={async () => {
                            await api(`matches/${match.id}/cancel`, {});
                            setMatch(await api(`matches/${match.id}`));
                          }}
                        >
                          取消比赛
                        </button>
                      )}
                      {["failed", "cancelled"].includes(match.status) && (
                        <button
                          className="secondary"
                          onClick={async () => {
                            await api(`matches/${match.id}/retry`, {});
                            setMatch(await api(`matches/${match.id}`));
                            setCursor(0);
                            setPlaying(true);
                          }}
                        >
                          使用相同参赛快照重试
                        </button>
                      )}
                    </aside>
                  </div>
                  <section className="battle-log">
                    <div className="log-tabs">
                      {(
                        [
                          ["timeline", "行动时间线"],
                          ["tools", "Tool Calls"],
                          ["review", "战术复盘"],
                        ] as const
                      ).map(([id, text]) => (
                        <button
                          key={id}
                          className={logTab === id ? "chosen" : ""}
                          onClick={() => setLogTab(id)}
                        >
                          {text}
                        </button>
                      ))}
                      <span>
                        {cursor} / {match.frames.length} 次行动 ·{" "}
                        {match.tokens.toLocaleString()} tokens
                      </span>
                    </div>
                    {logTab === "timeline" ? (
                      <div className="timeline" ref={logRef}>
                        {cursor === 0 && (
                          <p className="empty">
                            战士已经入场。点击播放或下一步查看真实行动记录。
                          </p>
                        )}
                        {match.frames.slice(0, cursor).map((f) => (
                          <button
                            key={f.index}
                            className={`timeline-row ${f.index === cursor ? "current" : ""}`}
                            onClick={() => {
                              setCursor(f.index);
                              setPlaying(false);
                            }}
                          >
                            <span className="log-index">
                              {String(f.index).padStart(2, "0")}
                            </span>
                            <span className={`team-color-${f.actor}`}>
                              {match.participants[f.actor].name}
                            </span>
                            <b>{actionName(f.action)}</b>
                            <span>
                              {f.events
                                .filter((e) => e.kind !== "status")
                                .map((e) => e.text)
                                .join(" / ")}
                            </span>
                            <small>
                              {f.decision.mode === "llm"
                                ? `${f.decision.calls} calls · ${f.decision.totalTokens} tk`
                                : "DEMO"}
                            </small>
                          </button>
                        ))}
                      </div>
                    ) : logTab === "tools" ? (
                      <div className="tool-log">
                        {frame ? (
                          <>
                            <h3>
                              第 {frame.index} 次行动 ·{" "}
                              {frame.decision.ok ? "执行成功" : "执行失败"}
                            </h3>
                            <p className="subtle">
                              请求 {frame.decision.calls} 次 · 输入{" "}
                              {frame.decision.inputTokens} / 输出{" "}
                              {frame.decision.outputTokens} tokens ·{" "}
                              {frame.decision.latencyMs} ms
                            </p>
                            {frame.decision.attempts.map((a, i) => (
                              <div className="tool-attempt" key={i}>
                                <b className={a.ok ? "mint" : "danger"}>
                                  {a.ok ? "✓" : "×"} {a.name}
                                </b>
                                <pre>{JSON.stringify(a.args, null, 2)}</pre>
                                <details>
                                  <summary>工具执行结果</summary>
                                  <pre>{a.result}</pre>
                                </details>
                              </div>
                            ))}
                          </>
                        ) : (
                          <p className="empty">
                            选择一个行动查看实际工具调用。
                          </p>
                        )}
                        {match.failures.map((f, i) => (
                          <div className="alert error" key={i}>
                            <div>
                              <b>行动 {f.ply + 1} · 模型失败</b>
                              <p>{f.decision.error}</p>
                              <p>
                                {f.decision.calls} calls ·{" "}
                                {f.decision.totalTokens} tokens ·{" "}
                                {f.decision.latencyMs} ms
                              </p>
                              {f.decision.attempts.map((a, j) => (
                                <pre key={j}>
                                  {a.name} {JSON.stringify(a.args)} → {a.result}
                                </pre>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Review match={match} cursor={cursor} />
                    )}
                  </section>
                </>
              )}
            </>
          ) : tab === "agents" ? (
            <>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">THE WARRIOR'S WORKSHOP</span>
                  <h1>你的战士，你的战术。</h1>
                  <p className="subtle">
                    有限的能力，无限的构想。每一次修改，都是下一场胜利的起点。
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() =>
                    setEditor({
                      ...structuredClone(PRESETS[0]),
                      id: "",
                      name: "我的战士",
                    })
                  }
                >
                  ＋ 创建 Agent
                </button>
              </div>
              <Roster
                chars={chars}
                standings={standings}
                onEdit={setEditor}
                onCopy={copy}
              />
            </>
          ) : (
            <>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">BATTLE ARCHIVES</span>
                  <h1>每一场交锋，都有迹可循。</h1>
                  <p className="subtle">
                    本地异步挑战记录 · 参赛配置不会随之后的编辑改变
                  </p>
                </div>
              </div>
              <div className="history-list">
                {!history.length && (
                  <div className="empty panel">
                    还没有比赛记录。去竞技场发起第一场挑战。
                  </div>
                )}
                {history.map((m) => (
                  <button
                    key={m.id}
                    className="history-row"
                    onClick={() => openMatch(m.id)}
                  >
                    <span className="history-symbol">⚔</span>
                    <div>
                      <b>
                        {m.participants[0].name}{" "}
                        <span className="subtle">vs</span>{" "}
                        {m.participants[1].name}
                      </b>
                      <small>
                        {date(m.createdAt)} · 种子 {m.initial.seed} ·{" "}
                        {m.mode === "demo" ? "规则 AI / Demo" : m.model}
                      </small>
                    </div>
                    <span className="history-result">
                      {m.status === "completed"
                        ? m.state.winner === null
                          ? "平局"
                          : `${m.participants[m.state.winner].name} 获胜`
                        : {
                            running: "进行中",
                            queued: "排队中",
                            failed: "失败",
                            cancelled: "已取消",
                          }[m.status]}
                    </span>
                    <span className="subtle">{m.state.ply} 次行动</span>
                    <span>查看回放 ↗</span>
                  </button>
                ))}
              </div>
              <div className="section-heading">
                <div>
                  <h2>本地 Elo · {mode === "demo" ? "Demo 组" : "LLM 组"}</h2>
                  <p className="subtle">
                    竞技表现与能力预算分开记录；不同模式分别计分，同一角色自对战不计分。
                  </p>
                </div>
              </div>
              <div className="ranking">
                {standings.map((s, i) => (
                  <div key={s.id}>
                    <b className="rank-number">
                      {String(i + 1).padStart(2, "0")}
                    </b>
                    <strong>{s.name}</strong>
                    <span>
                      {s.wins} 胜 / {s.losses} 负 / {s.draws} 平
                    </span>
                    <b className="mint">{Math.round(s.elo)} Elo</b>
                  </div>
                ))}
              </div>
            </>
          )}
          <footer className="footer">
            <span>AGENT ARENA</span>
            <p>玩家创造与训练战士，Agent 自主战斗。</p>
            <span>本地原型 / 无线上匹配</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function Roster({
  chars,
  standings,
  onEdit,
  onCopy,
  onNew,
  compact = false,
}: {
  chars: Character[];
  standings: Standing[];
  onEdit: (c: Character) => void;
  onCopy: (c: Character) => void;
  onNew?: () => void;
  compact?: boolean;
}) {
  return (
    <>
      {compact && (
        <div className="section-heading roster-heading">
          <h2>
            召集你的战士 <span className="count">04</span>
          </h2>
          <button className="text-button" onClick={onNew}>
            全部战士 →
          </button>
        </div>
      )}
      <div className="roster">
        {chars.map((c) => {
          const record = standings.find((s) => s.id === c.id);
          return (
            <article key={c.id} className={`agent-card ${c.classId}`}>
              <div className="card-top">
                <span>{CLASS_NAMES[c.classId]}</span>
                <span>v{c.version} ◇</span>
              </div>
              <button
                className="card-art"
                onClick={() => onEdit(structuredClone(c))}
                aria-label={`编辑 ${c.name}`}
              >
                <span className="art-halo" />
                <Warrior
                  kind={c.classId}
                  color={
                    c.classId === "mage"
                      ? "#9aa7c7"
                      : c.classId === "berserker"
                        ? "#ae9b79"
                        : "#b0c1a4"
                  }
                  portrait
                />
                <span className="art-line" />
              </button>
              <div className="card-body">
                <h3>{c.name}</h3>
                <p>{c.description}</p>
                <div className="card-tags">
                  <span>{c.race}</span>
                  <span>{styleNames[c.style]}</span>
                  <span>
                    预算 {points(c)}/{BUDGET}
                  </span>
                </div>
                <div className="card-stats">
                  <span>♥ {c.stats.hp}</span>
                  <span>⚔ {c.stats.power}</span>
                  <span>◈ {c.stats.armor}</span>
                  <span>◎ {c.stats.range}</span>
                </div>
                <div className="card-bottom">
                  <span>
                    {record
                      ? `${record.wins} 胜 · ${Math.round(record.elo)} Elo`
                      : "等待初次交锋"}
                  </span>
                  <button onClick={() => onCopy(c)}>复制</button>
                  <button onClick={() => onEdit(structuredClone(c))}>
                    编辑 ↗
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function Editor({
  character,
  onSave,
  onCancel,
}: {
  character: Character;
  onSave: (c: Character) => Promise<void>;
  onCancel: () => void;
}) {
  const [c, setC] = useState(structuredClone(character)),
    [issue, setIssue] = useState(""),
    [saving, setSaving] = useState(false);
  const update = <K extends keyof Character>(key: K, value: Character[K]) =>
    setC((v) => ({ ...v, [key]: value }));
  const p = points(c),
    validation = characterSchema.safeParse(c);
  const fromConcept = () => {
    const t = c.originalConcept;
    const kind = /法师|魔法|火焰|冰霜/.test(t)
      ? "mage"
      : /游侠|弓|精灵|远程/.test(t)
        ? "ranger"
        : /兽人|狮|狂战|巨力|肉搏/.test(t)
          ? "berserker"
          : "knight";
    const template = PRESETS.find((p) => p.classId === kind)!;
    setC((v) => ({
      ...structuredClone(template),
      id: v.id,
      version: v.version,
      name: v.name,
      originalConcept: t,
      description: t.slice(0, 1500),
      background: t.slice(0, 1500),
    }));
  };
  const submit = async () => {
    setIssue("");
    if (!validation.success) {
      setIssue(validation.error.issues.map((i) => i.message).join("；"));
      return;
    }
    setSaving(true);
    try {
      await onSave(c);
    } catch (e) {
      setIssue((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const statLabels: [keyof Stats, string, number, number, number][] = [
    ["hp", "生命", 60, 120, 10],
    ["power", "攻击", 10, 22, 2],
    ["armor", "护甲", 0, 6, 1],
    ["speed", "移动", 1, 3, 1],
    ["energy", "能量", 20, 60, 10],
    ["range", "射程", 1, 4, 1],
  ];
  return (
    <div className="editor">
      <div className="section-heading">
        <div>
          <button className="back-link" onClick={onCancel}>
            ← 返回
          </button>
          <span className="eyebrow">WARRIOR FORGE</span>
          <h1>{character.id ? "打磨你的战士" : "创造你的 Agent"}</h1>
        </div>
        <button
          className="primary"
          onClick={submit}
          disabled={saving || !validation.success}
        >
          {saving ? "保存中…" : "保存角色"} ↗
        </button>
      </div>
      {issue && (
        <div role="alert" className="alert error">
          {issue}
        </div>
      )}
      <div className="editor-layout">
        <div className="editor-form">
          <section className="panel">
            <h2>
              <span className="step">01</span> 一个念头，一个战士
            </h2>
            <label>
              自由描述
              <textarea
                aria-label="自然语言角色描述"
                rows={3}
                placeholder="一名狮族佣兵，擅长近身爆发，勇猛而缺乏远程手段……"
                value={c.originalConcept}
                onChange={(e) => update("originalConcept", e.target.value)}
                maxLength={4000}
              />
            </label>
            <div className="concept-bottom">
              <p>
                关键词模板映射，无 LLM
                调用。原始描述单独保留；实际能力始终受预算约束。
              </p>
              <button className="secondary" onClick={fromConcept}>
                生成模板草案
              </button>
            </div>
            <div className="form-grid">
              <label>
                角色名称
                <input
                  aria-label="角色名称"
                  value={c.name}
                  maxLength={40}
                  onChange={(e) => update("name", e.target.value)}
                />
              </label>
              <label>
                外观职业
                <select
                  value={c.classId}
                  onChange={(e) =>
                    update("classId", e.target.value as Character["classId"])
                  }
                >
                  {CLASSES.map((k) => (
                    <option key={k} value={k}>
                      {CLASS_NAMES[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                种族
                <input
                  value={c.race}
                  onChange={(e) => update("race", e.target.value)}
                  maxLength={80}
                />
              </label>
              <label>
                人格特征
                <input
                  value={c.personality}
                  onChange={(e) => update("personality", e.target.value)}
                  maxLength={400}
                />
              </label>
            </div>
            <label>
              简介
              <input
                value={c.description}
                onChange={(e) => update("description", e.target.value)}
                maxLength={1500}
              />
            </label>
            <label>
              背景设定
              <textarea
                rows={2}
                value={c.background}
                onChange={(e) => update("background", e.target.value)}
                maxLength={1500}
              />
            </label>
            <label>
              装备（叙事外观，实际能力由属性和技能决定）
              <input
                value={c.equipment}
                onChange={(e) => update("equipment", e.target.value)}
                maxLength={200}
              />
            </label>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>
                <span className="step">02</span> 将构想化为能力
              </h2>
              <span className={`budget ${p > BUDGET ? "over" : ""}`}>
                预算 {p} / {BUDGET}
              </span>
            </div>
            <div className="stat-sliders">
              {statLabels.map(([key, name, min, max, step]) => (
                <label key={key}>
                  <span>
                    {name}
                    <b>{c.stats[key]}</b>
                  </span>
                  <input
                    aria-label={`${name}属性`}
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={c.stats[key]}
                    onChange={(e) =>
                      update("stats", { ...c.stats, [key]: +e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
            <p className="subtle">
              统一预算上限 {BUDGET} · 属性可自由分配 · 职业与种族不提供隐藏加成
            </p>
            <h3>
              技能组合 <small>选择 1–3 项</small>
            </h3>
            <div className="skill-options">
              {Object.entries(SKILLS).map(([k, s]) => {
                const selected = c.skills.includes(k as keyof typeof SKILLS);
                return (
                  <button
                    key={k}
                    className={selected ? "selected" : ""}
                    aria-pressed={selected}
                    onClick={() =>
                      update(
                        "skills",
                        selected
                          ? c.skills.filter((id) => id !== k)
                          : [...c.skills, k as keyof typeof SKILLS],
                      )
                    }
                  >
                    <span>
                      <b>
                        {selected ? "✓ " : "＋ "}
                        {s.name}
                      </b>
                      <em>{s.points} 点</em>
                    </span>
                    <p>{s.description}</p>
                    <small>
                      能量 {s.cost} · 冷却 {s.cooldown} · 射程 {s.range}
                    </small>
                  </button>
                );
              })}
            </div>
            {!validation.success && (
              <p className="danger" role="status">
                {validation.error.issues.map((i) => i.message).join("；")}
              </p>
            )}
          </section>
          <section className="panel">
            <h2>
              <span className="step">03</span> 赋予战术与意志
            </h2>
            <label>
              Demo 战术风格
              <select
                aria-label="战术风格"
                value={c.style}
                onChange={(e) =>
                  update("style", e.target.value as Character["style"])
                }
              >
                {Object.entries(styleNames).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              LLM 战术 Prompt{" "}
              <span className="mint">真实进入 Pi Agent 上下文</span>
              <textarea
                aria-label="战术提示词"
                className="prompt-input"
                rows={8}
                maxLength={4000}
                value={c.prompt}
                onChange={(e) => update("prompt", e.target.value)}
              />
            </label>
            <div className="concept-bottom">
              <p>
                只影响真实 LLM 的决策偏好，不改变引擎规则。Demo
                只读取上方战术风格。
              </p>
              <button
                className="text-button"
                onClick={() =>
                  update(
                    "prompt",
                    PRESETS.find((v) => v.classId === c.classId)!.prompt,
                  )
                }
              >
                恢复职业提示词
              </button>
            </div>
            <button
              className="primary"
              disabled={saving || !validation.success}
              onClick={submit}
            >
              保存角色与战术 →
            </button>
          </section>
        </div>
        <aside className="editor-preview">
          <div className={`agent-card ${c.classId}`}>
            <div className="card-top">
              <span>角色预览</span>
              <span>Tier I</span>
            </div>
            <div className="card-art">
              <span className="art-halo" />
              <Warrior kind={c.classId} portrait />
            </div>
            <div className="card-body">
              <h2>{c.name || "无名战士"}</h2>
              <p>
                {c.race} · {CLASS_NAMES[c.classId]}
              </p>
              <div className="card-tags">
                <span>{styleNames[c.style]}</span>
                <span>
                  {p}/{BUDGET} 能力点
                </span>
              </div>
              <p>{c.equipment}</p>
            </div>
          </div>
          <div className="editor-tip">
            <span>✧ 教练手记</span>
            <p>
              相同的能力，也可以有不同的解法。尝试复制一个战士，只修改
              Prompt，再比较多场战斗的工具选择与胜率。
            </p>
            <p>角色能力由预算约束；Agent 的竞技实力由战绩衡量。</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Review({ match, cursor }: { match: Match; cursor: number }) {
  const frames = match.frames.slice(0, cursor);
  return (
    <div className="review">
      <div className="review-note">
        基于实际事件统计的复盘 ·{" "}
        {cursor < match.frames.length ? "当前回放进度" : "全场"} ·
        不生成或展示内部思维链
      </div>
      <div className="review-grid">
        {match.participants.map((c, actor) => {
          const own = frames.filter((f) => f.actor === actor),
            damage = frames
              .flatMap((f) => f.events)
              .filter(
                (e) =>
                  e.actor === actor &&
                  e.kind === "damage" &&
                  e.target !== actor,
              )
              .reduce((n, e) => n + (e.amount || 0), 0);
          const actions = own.reduce<Record<string, number>>((r, f) => {
            const key = actionName(f.action);
            r[key] = (r[key] || 0) + 1;
            return r;
          }, {});
          return (
            <div className="panel" key={actor}>
              <h3>{c.name}</h3>
              <div className="review-stats">
                <span>
                  造成伤害<b>{damage}</b>
                </span>
                <span>
                  决策次数<b>{own.length}</b>
                </span>
                <span>
                  模型用量
                  <b>{own.reduce((n, f) => n + f.decision.totalTokens, 0)}</b>
                </span>
              </div>
              <div className="action-distribution">
                {Object.entries(actions).map(([name, n]) => (
                  <div key={name}>
                    <span>{name}</span>
                    <i
                      style={{
                        width: `${(n / Math.max(1, own.length)) * 100}%`,
                      }}
                    />
                    <b>{n}</b>
                  </div>
                ))}
              </div>
              <details>
                <summary>查看参赛战术 Prompt · v{c.version}</summary>
                <p>{c.prompt}</p>
              </details>
              <p className="subtle">
                {own.filter((f) => f.action.type === "defend").length >= 5
                  ? "防御行动较多：检查资源管理是否挤占了有效攻击。"
                  : own.filter((f) => f.action.type === "move").length >
                      own.length / 2
                    ? "移动占比较高：检查射程、视线与追击策略。"
                    : "比较技能释放时机、药剂使用与对手的距离变化，调整下一版战术。"}
              </p>
            </div>
          );
        })}
      </div>
      <p className="subtle">
        开局双方距离{" "}
        {distance(match.initial.fighters[0], match.initial.fighters[1])}{" "}
        格。达到上限比较剩余 HP 比例，比例相同则平局；取消或失败不计积分。
      </p>
    </div>
  );
}
