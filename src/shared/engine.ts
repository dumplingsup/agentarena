import {
  actionSchema,
  RULES_VERSION,
  SKILLS,
  type Action,
  type BattleState,
  type Character,
  type Fighter,
  type GameEvent,
  type Pos,
  type SkillId,
} from "./model.js";
export const distance = (a: Pos, b: Pos) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const same = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
export const inside = (p: Pos) => p.x >= 0 && p.x < 7 && p.y >= 0 && p.y < 5;
export function createBattle(
  chars: [Character, Character],
  seed = 42,
  maxPlies = 80,
): BattleState {
  const fighter = (c: Character, x: number): Fighter => ({
    id: c.id,
    name: c.name,
    classId: c.classId,
    stats: structuredClone(c.stats),
    skills: [...c.skills],
    x,
    y: 2,
    hp: c.stats.hp,
    energy: c.stats.energy,
    shield: 0,
    guard: false,
    root: 0,
    potion: 1,
    cooldowns: {},
  });
  return {
    rules: RULES_VERSION,
    seed,
    rng: seed >>> 0,
    ply: 0,
    maxPlies,
    active: 0,
    fighters: [fighter(chars[0], 0), fighter(chars[1], 6)],
    obstacles: [
      { x: 2, y: 1 },
      { x: 2, y: 3 },
      { x: 4, y: 1 },
      { x: 4, y: 3 },
    ],
    hazards: [],
    status: "running",
    winner: null,
    reason: "",
  };
}
export function lineOfSight(s: BattleState, a: Pos, b: Pos) {
  let x = a.x,
    y = a.y;
  const dx = Math.abs(b.x - x),
    dy = Math.abs(b.y - y),
    sx = x < b.x ? 1 : -1,
    sy = y < b.y ? 1 : -1;
  let err = dx - dy;
  while (x !== b.x || y !== b.y) {
    const e = 2 * err;
    if (e > -dy) {
      err -= dy;
      x += sx;
    }
    if (e < dx) {
      err += dx;
      y += sy;
    }
    if (s.obstacles.some((p) => p.x === x && p.y === y)) return false;
  }
  return true;
}
export function reachable(s: BattleState, actor: number, max: number): Pos[] {
  const me = s.fighters[actor],
    enemy = s.fighters[1 - actor];
  const q = [{ x: me.x, y: me.y, n: 0 }],
    seen = new Set([`${me.x},${me.y}`]),
    out: Pos[] = [];
  for (let i = 0; i < q.length; i++) {
    const p = q[i];
    if (p.n >= max) continue;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const v = { x: p.x + dx, y: p.y + dy },
        k = `${v.x},${v.y}`;
      if (
        !inside(v) ||
        seen.has(k) ||
        same(v, enemy) ||
        s.obstacles.some((o) => same(o, v))
      )
        continue;
      seen.add(k);
      out.push(v);
      q.push({ ...v, n: p.n + 1 });
    }
  }
  return out;
}
export function validateAction(s: BattleState, raw: unknown): string | null {
  const parsed = actionSchema.safeParse(raw);
  if (!parsed.success)
    return `参数不符合 Schema: ${parsed.error.issues.map((i) => i.message).join("; ")}`;
  if (s.status !== "running") return "比赛已经结束";
  const a = parsed.data,
    me = s.fighters[s.active],
    enemy = s.fighters[1 - s.active];
  const d = distance(me, enemy);
  if (a.type === "move") {
    if (me.root) return "被禁锢，不能移动";
    return reachable(s, s.active, me.stats.speed).some((p) => same(p, a))
      ? null
      : "目标不可达：超出移动距离、障碍物或被占用";
  }
  if (a.type === "attack")
    return d <= me.stats.range && lineOfSight(s, me, enemy)
      ? null
      : "敌人在射程外或被障碍遮挡";
  if (a.type === "use_item")
    return me.potion > 0 && me.hp < me.stats.hp ? null : "药剂已用完或生命已满";
  if (a.type === "defend") return null;
  const k = a.skillId,
    skill = SKILLS[k];
  if (!me.skills.includes(k)) return "未装备此技能";
  if ((me.cooldowns[k] || 0) > 0) return "技能冷却中";
  if (me.energy < skill.cost) return "能量不足";
  if (k === "heal") return me.hp < me.stats.hp ? null : "生命已满";
  if (k === "shield") return me.shield < 20 ? null : "护盾已满";
  if (k === "blink") {
    if (me.root) return "被禁锢，不能位移";
    if (a.x === undefined || a.y === undefined) return "缺少位移坐标";
    return distance(me, a as Pos) <= 4 &&
      !same(me, a as Pos) &&
      !same(enemy, a as Pos) &&
      !s.obstacles.some((p) => same(p, a as Pos))
      ? null
      : "无效位移落点";
  }
  if (k === "charge") {
    if (me.root) return "被禁锢，不能冲锋";
    return d <= 3 &&
      d > 1 &&
      lineOfSight(s, me, enemy) &&
      reachable(s, s.active, 3).some((p) => distance(p, enemy) === 1)
      ? null
      : "冲锋需要 2–3 格距离、视线与可达邻接落点";
  }
  if (k === "fireball") {
    if (a.x === undefined || a.y === undefined) return "缺少爆炸坐标";
    return distance(me, a as Pos) <= 4 &&
      lineOfSight(s, me, a as Pos) &&
      !s.obstacles.some((p) => same(p, a as Pos))
      ? null
      : "爆炸目标超出射程或被遮挡";
  }
  return d <= skill.range && lineOfSight(s, me, enemy)
    ? null
    : "技能射程不足或被遮挡";
}
export function legalActions(s: BattleState): Action[] {
  if (s.status !== "running") return [];
  const me = s.fighters[s.active];
  const list: Action[] = [
    { type: "attack" },
    { type: "defend" },
    { type: "use_item" },
  ];
  for (const p of reachable(s, s.active, me.stats.speed))
    list.push({ type: "move", ...p });
  for (const skillId of me.skills) {
    if (skillId === "blink" || skillId === "fireball") {
      for (let y = 0; y < 5; y++)
        for (let x = 0; x < 7; x++)
          list.push({ type: "use_skill", skillId, x, y });
    } else list.push({ type: "use_skill", skillId });
  }
  return list.filter((a) => !validateAction(s, a));
}
export function observation(s: BattleState, actor: number) {
  return {
    rules: RULES_VERSION,
    map: { width: 7, height: 5, obstacles: s.obstacles, hazards: s.hazards },
    ply: s.ply,
    maxPlies: s.maxPlies,
    self: structuredClone(s.fighters[actor]),
    opponent: structuredClone(s.fighters[1 - actor]),
    legalActions: actor === s.active ? legalActions(s) : [],
    mechanics:
      "曼哈顿距离；每次一个动作；结束行动回复4能量。障碍阻挡移动/视线，邻接障碍降低远程伤害20%。防御减伤50%直到自己下一次行动，额外回复6能量。药剂一次回复28。回合上限按剩余HP比例决定胜负，相等平局。",
  };
}
export function applyAction(
  input: BattleState,
  raw: Action,
): { state: BattleState; events: GameEvent[] } {
  const error = validateAction(input, raw);
  if (error) throw new Error(error);
  const a = actionSchema.parse(raw),
    s = structuredClone(input),
    actor = s.active,
    target = 1 - actor;
  const me = s.fighters[actor],
    enemy = s.fighters[target],
    events: GameEvent[] = [];
  me.guard = false;
  const emit = (
    kind: GameEvent["kind"],
    text: string,
    amount?: number,
    t?: number,
  ) => events.push({ kind, actor, text, amount, target: t });
  const heal = (n: number) => {
    const v = Math.min(n, me.stats.hp - me.hp);
    me.hp += v;
    emit("heal", `${me.name} 回复 ${v} 点生命`, v, actor);
  };
  const damage = (
    f: Fighter,
    ti: number,
    base: number,
    pierce = 0,
    ranged = false,
  ) => {
    s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
    const cover = ranged && s.obstacles.some((p) => distance(p, f) === 1);
    let n = Math.max(
      1,
      Math.round(
        (base * (0.9 + (s.rng / 4294967296) * 0.2) -
          Math.max(0, f.stats.armor - pierce)) *
          (f.guard ? 0.5 : 1) *
          (cover ? 0.8 : 1),
      ),
    );
    const absorbed = Math.min(f.shield, n);
    f.shield -= absorbed;
    n -= absorbed;
    f.hp = Math.max(0, f.hp - n);
    emit(
      "damage",
      `${f.name} 受到 ${n} 点伤害${absorbed ? `（护盾吸收 ${absorbed}）` : ""}${cover ? " · 掩体减伤" : ""}`,
      n,
      ti,
    );
  };
  if (a.type === "move") {
    me.x = a.x;
    me.y = a.y;
    emit("move", `${me.name} 移动到 (${a.x}, ${a.y})`);
  }
  if (a.type === "attack") {
    emit("status", `${me.name} 发起普通攻击`);
    damage(enemy, target, me.stats.power, 0, distance(me, enemy) > 1);
  }
  if (a.type === "defend") {
    me.guard = true;
    me.energy = Math.min(me.stats.energy, me.energy + 6);
    emit("defend", `${me.name} 防御，减伤 50% 并恢复能量`);
  }
  if (a.type === "use_item") {
    me.potion--;
    heal(28);
  }
  if (a.type === "use_skill") {
    const k = a.skillId;
    me.energy -= SKILLS[k].cost;
    emit("status", `${me.name} 施放 ${SKILLS[k].name}`);
    if (k === "shield") {
      me.shield = 20;
      emit("shield", `${me.name} 获得 20 点护盾`, 20, actor);
    }
    if (k === "heal") heal(22);
    if (k === "blink") {
      me.x = a.x!;
      me.y = a.y!;
      emit("move", `${me.name} 疾风步至 (${a.x}, ${a.y})`);
    }
    if (k === "charge") {
      const p = reachable(s, actor, 3)
        .filter((p) => distance(p, enemy) === 1)
        .sort((p, q) => distance(p, me) - distance(q, me))[0];
      me.x = p.x;
      me.y = p.y;
      emit("move", `${me.name} 冲锋近身`);
      damage(enemy, target, me.stats.power * 1.3);
    }
    if (k === "cleave") damage(enemy, target, me.stats.power * 1.8, 2);
    if (k === "powershot") damage(enemy, target, me.stats.power * 1.5, 2, true);
    if (k === "frost") {
      damage(enemy, target, me.stats.power * 0.8, 0, true);
      enemy.root = 1;
      emit("status", `${enemy.name} 被禁锢一次行动`);
    }
    if (k === "fireball") {
      const center = { x: a.x!, y: a.y! };
      for (let t = 0; t < 2; t++)
        if (distance(s.fighters[t], center) <= 1)
          damage(s.fighters[t], t, me.stats.power * 1.5, 1, true);
      for (let y = 0; y < 5; y++)
        for (let x = 0; x < 7; x++)
          if (
            distance({ x, y }, center) <= 1 &&
            !s.obstacles.some((p) => p.x === x && p.y === y)
          )
            s.hazards.push({ x, y, until: s.ply + 3, owner: actor });
    }
  }
  // Standing in a flame is checked AFTER the action, so escaping is meaningful.
  if (
    s.hazards.some((p) => same(p, me) && p.until >= s.ply && p.owner !== actor)
  )
    damage(me, actor, 6, 6);
  me.root = Math.max(0, me.root - 1);
  for (const k of Object.keys(me.cooldowns) as SkillId[])
    me.cooldowns[k] = Math.max(0, (me.cooldowns[k] || 0) - 1);
  if (a.type === "use_skill")
    me.cooldowns[a.skillId] = SKILLS[a.skillId].cooldown;
  me.energy = Math.min(me.stats.energy, me.energy + 4);
  s.ply++;
  s.hazards = s.hazards.filter((h) => h.until >= s.ply);
  s.active = target as 0 | 1;
  if (s.fighters.some((f) => f.hp <= 0) || s.ply >= s.maxPlies) {
    s.status = "finished";
    const [f, g] = s.fighters;
    const diff =
      f.hp <= 0 || g.hp <= 0
        ? f.hp - g.hp
        : f.hp * g.stats.hp - g.hp * f.stats.hp;
    s.winner = diff === 0 ? null : diff > 0 ? 0 : 1;
    s.reason =
      s.ply >= s.maxPlies && f.hp > 0 && g.hp > 0
        ? "达到行动上限，比较剩余生命比例"
        : "生命耗尽";
    emit(
      "end",
      `${s.winner === null ? "平局" : s.fighters[s.winner].name + " 获胜"} · ${s.reason}`,
    );
  }
  return { state: s, events };
}
