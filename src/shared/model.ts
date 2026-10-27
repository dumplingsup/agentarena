import { z } from "zod";

export const RULES_VERSION = "arena-1.0";
export const BUDGET = 24;
export const CLASSES = ["knight", "ranger", "mage", "berserker"] as const;
export type ClassId = (typeof CLASSES)[number];
export const CLASS_NAMES: Record<ClassId, string> = {
  knight: "誓约骑士",
  ranger: "灰林游侠",
  mage: "余烬法师",
  berserker: "赤牙佣兵",
};
export const SKILLS = {
  charge: {
    name: "盾锋冲锋",
    description: "向 3 格内敌人突进，造成 1.3 倍伤害。需要可达的邻接落点。",
    cost: 12,
    cooldown: 3,
    range: 3,
    points: 4,
  },
  shield: {
    name: "钢铁壁垒",
    description: "获得 20 点护盾，持续到被消耗。",
    cost: 10,
    cooldown: 4,
    range: 0,
    points: 3,
  },
  powershot: {
    name: "穿云箭",
    description: "射程 4，造成 1.5 倍伤害，忽略 2 点护甲。",
    cost: 12,
    cooldown: 3,
    range: 4,
    points: 4,
  },
  blink: {
    name: "疾风步",
    description: "传送至 4 格内空地，可穿越障碍。",
    cost: 10,
    cooldown: 3,
    range: 4,
    points: 3,
  },
  fireball: {
    name: "余烬爆裂",
    description:
      "射程 4，爆炸半径 1，造成 1.5 倍伤害并留下持续 3 次行动的灼烧区域。",
    cost: 16,
    cooldown: 3,
    range: 4,
    points: 5,
  },
  frost: {
    name: "寒霜禁锢",
    description: "射程 3，造成 0.8 倍伤害，限制敌人下一次行动的移动。",
    cost: 12,
    cooldown: 3,
    range: 3,
    points: 4,
  },
  heal: {
    name: "复苏",
    description: "回复 22 点生命。",
    cost: 16,
    cooldown: 4,
    range: 0,
    points: 4,
  },
  cleave: {
    name: "裂甲重斩",
    description: "近战造成 1.8 倍伤害，忽略 2 点护甲。",
    cost: 14,
    cooldown: 3,
    range: 1,
    points: 4,
  },
} as const;
export type SkillId = keyof typeof SKILLS;
const skillIds = Object.keys(SKILLS) as [SkillId, ...SkillId[]];
export const statsSchema = z
  .object({
    hp: z
      .number()
      .int()
      .min(60)
      .max(120)
      .refine((v) => v % 10 === 0),
    power: z
      .number()
      .int()
      .min(10)
      .max(22)
      .refine((v) => v % 2 === 0),
    armor: z.number().int().min(0).max(6),
    speed: z.number().int().min(1).max(3),
    energy: z
      .number()
      .int()
      .min(20)
      .max(60)
      .refine((v) => v % 10 === 0),
    range: z.number().int().min(1).max(4),
  })
  .strict();
export type Stats = z.infer<typeof statsSchema>;
export function points(c: { stats: Stats; skills: readonly SkillId[] }) {
  const s = c.stats;
  return (
    (s.hp - 60) / 10 +
    (s.power - 10) / 2 +
    s.armor +
    (s.speed - 1) * 2 +
    (s.energy - 20) / 10 +
    (s.range - 1) * 2 +
    c.skills.reduce((a, k) => a + SKILLS[k].points, 0)
  );
}
export const characterSchema = z
  .object({
    id: z.string().max(80),
    version: z.number().int().min(1),
    name: z.string().trim().min(1).max(40),
    classId: z.enum(CLASSES),
    description: z.string().max(1500),
    race: z.string().max(80),
    background: z.string().max(1500),
    personality: z.string().max(400),
    style: z.enum(["aggressive", "balanced", "cautious"]),
    prompt: z.string().min(1).max(4000),
    originalConcept: z.string().max(4000),
    equipment: z.string().max(200),
    stats: statsSchema,
    skills: z.array(z.enum(skillIds)).min(1).max(3),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (new Set(c.skills).size !== c.skills.length)
      ctx.addIssue({
        code: "custom",
        path: ["skills"],
        message: "技能不可重复",
      });
    if (points(c) > BUDGET)
      ctx.addIssue({
        code: "custom",
        path: ["stats"],
        message: `能力预算 ${points(c)}/${BUDGET}，请降低属性或移除技能`,
      });
  });
export type Character = z.infer<typeof characterSchema>;
export const PRESETS: Character[] = [
  {
    id: "knight",
    version: 1,
    name: "罗兰 · 灰誓",
    classId: "knight",
    description: "将誓言铸入钢铁的流浪骑士。",
    race: "人类",
    background: "王国覆灭之后，仍然守护弱者。",
    personality: "沉着、坚毅",
    style: "balanced",
    prompt:
      "借助掩体接近远程敌人，距离合适时冲锋。生命低时先建立护盾；敌人近身时稳定攻击，不要无意义地防守。",
    originalConcept: "",
    equipment: "长剑 / 塔盾 / 板甲",
    stats: { hp: 100, power: 14, armor: 5, speed: 2, energy: 40, range: 1 },
    skills: ["charge", "shield"],
  },
  {
    id: "ranger",
    version: 1,
    name: "伊芙 · 林影",
    classId: "ranger",
    description: "风声是她放箭前唯一的预告。",
    race: "精灵",
    background: "来自灰林边境的追猎者。",
    personality: "敏锐、谨慎",
    style: "cautious",
    prompt:
      "保持 3 格射程，优先穿云箭。近战敌人靠近时用疾风步拉开距离。低血量使用药剂；避免退入死角，保持射线通畅。",
    originalConcept: "",
    equipment: "长弓 / 皮甲 / 猎刀",
    stats: { hp: 80, power: 14, armor: 1, speed: 2, energy: 40, range: 3 },
    skills: ["powershot", "blink"],
  },
  {
    id: "mage",
    version: 1,
    name: "瑟拉 · 余烬",
    classId: "mage",
    description: "在禁书与火焰之间寻找胜算。",
    race: "人类",
    background: "因研究战场魔法被学院驱逐。",
    personality: "冷静、善于计算",
    style: "balanced",
    prompt:
      "优先用余烬爆裂制造伤害与危险区域。敌人接近时使用寒霜禁锢，然后拉开距离。保留施法资源，必要时普通攻击或防守回能。",
    originalConcept: "",
    equipment: "余烬法杖 / 旅行法袍",
    stats: { hp: 70, power: 16, armor: 1, speed: 2, energy: 50, range: 3 },
    skills: ["fireball", "frost"],
  },
  {
    id: "berserker",
    version: 1,
    name: "格鲁克 · 赤牙",
    classId: "berserker",
    description: "以伤痕为勋章的兽人佣兵。",
    race: "兽人",
    background: "不为部落，只为下一场值得铭记的决斗。",
    personality: "果决、冒险",
    style: "aggressive",
    prompt:
      "尽快逼近对手，以冲锋接裂甲重斩制造爆发。不要浪费回合空等。生命低于三分之一时使用药剂，然后继续进攻。",
    originalConcept: "",
    equipment: "双手战斧 / 铆钉护甲",
    stats: { hp: 100, power: 20, armor: 2, speed: 2, energy: 40, range: 1 },
    skills: ["charge", "cleave"],
  },
];

const intent = { intent: z.string().max(180).optional() };
export const actionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("move"),
      x: z.number().int().min(0).max(6),
      y: z.number().int().min(0).max(4),
      ...intent,
    })
    .strict(),
  z.object({ type: z.literal("attack"), ...intent }).strict(),
  z.object({ type: z.literal("defend"), ...intent }).strict(),
  z.object({ type: z.literal("use_item"), ...intent }).strict(),
  z
    .object({
      type: z.literal("use_skill"),
      skillId: z.enum(skillIds),
      x: z.number().int().min(0).max(6).optional(),
      y: z.number().int().min(0).max(4).optional(),
      ...intent,
    })
    .strict(),
]);
export type Action = z.infer<typeof actionSchema>;
export type Pos = { x: number; y: number };
export type Fighter = Pos & {
  id: string;
  name: string;
  classId: ClassId;
  stats: Stats;
  skills: SkillId[];
  hp: number;
  energy: number;
  shield: number;
  guard: boolean;
  root: number;
  potion: number;
  cooldowns: Partial<Record<SkillId, number>>;
};
export type BattleState = {
  rules: string;
  seed: number;
  rng: number;
  ply: number;
  maxPlies: number;
  active: 0 | 1;
  fighters: [Fighter, Fighter];
  obstacles: Pos[];
  hazards: (Pos & { until: number; owner: number })[];
  status: "running" | "finished";
  winner: 0 | 1 | null;
  reason: string;
};
export type GameEvent = {
  kind: "move" | "damage" | "heal" | "shield" | "defend" | "status" | "end";
  actor: number;
  target?: number;
  amount?: number;
  text: string;
};
export type ToolAttempt = {
  name: string;
  args: unknown;
  ok: boolean;
  result: string;
};
export type DecisionMeta = {
  mode: "demo" | "llm";
  ok: boolean;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  calls: number;
  attempts: ToolAttempt[];
  error?: string;
};
export type Frame = {
  index: number;
  actor: number;
  action: Action;
  events: GameEvent[];
  state: BattleState;
  decision: DecisionMeta;
};
export type Match = {
  id: string;
  createdAt: string;
  mode: "demo" | "llm";
  participants: [Character, Character];
  initial: BattleState;
  frames: Frame[];
  failures: { ply: number; actor: number; decision: DecisionMeta }[];
  state: BattleState;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  error?: string;
  model?: string;
  rated: boolean;
  tokens: number;
  settled: boolean;
};
export type Standing = {
  id: string;
  name: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  games: number;
};
