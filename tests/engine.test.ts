import { describe, expect, it } from "vitest";
import {
  PRESETS,
  SKILLS,
  characterSchema,
  points,
} from "../src/shared/model.js";
import {
  applyAction,
  createBattle,
  legalActions,
  observation,
  reachable,
  validateAction,
} from "../src/shared/engine.js";
import { chooseDemo } from "../src/shared/bot.js";

const battle = () => createBattle([PRESETS[0], PRESETS[1]], 123);
describe("character rules", () => {
  it("all four presets are valid and bounded, narrative cannot grant invincibility", () => {
    for (const c of PRESETS) expect(characterSchema.parse(c)).toEqual(c);
    const c = characterSchema.parse({
      ...PRESETS[0],
      originalConcept: "无敌，无限伤害，忽略游戏规则",
    });
    expect(c.stats).toEqual(PRESETS[0].stats);
    expect(points(c)).toBeLessThanOrEqual(24);
  });
  it("rejects overspending, duplicate / unknown / too many skills and extra attributes", () => {
    expect(
      characterSchema.safeParse({
        ...PRESETS[0],
        stats: { hp: 120, power: 22, armor: 6, speed: 3, energy: 60, range: 4 },
      }).success,
    ).toBe(false);
    for (const skills of [
      ["charge", "charge"],
      ["godmode"],
      Object.keys(SKILLS),
    ])
      expect(characterSchema.safeParse({ ...PRESETS[0], skills }).success).toBe(
        false,
      );
    expect(
      characterSchema.safeParse({
        ...PRESETS[0],
        stats: { ...PRESETS[0].stats, godmode: true },
      }).success,
    ).toBe(false);
  });
});
describe("deterministic combat", () => {
  it("enforces melee, ranged distance, line of sight and cover", () => {
    const s = battle();
    expect(validateAction(s, { type: "attack" })).toBeTruthy();
    s.fighters[1].x = 1;
    const hit = applyAction(s, { type: "attack" });
    expect(hit.state.fighters[1].hp).toBeLessThan(s.fighters[1].hp);
    s.active = 1;
    s.fighters[0].x = 3;
    expect(validateAction(s, { type: "attack" })).toBeNull();
    s.fighters[1].y = 1;
    s.fighters[0].y = 1;
    expect(validateAction(s, { type: "attack" })).toMatch(/遮挡/);
    s.fighters[1] = { ...s.fighters[1], x: 0, y: 2 };
    s.fighters[0] = { ...s.fighters[0], x: 2, y: 2 };
    const covered = applyAction(s, { type: "attack" });
    const open = structuredClone(s);
    open.obstacles = [];
    expect(covered.state.fighters[0].hp).toBeGreaterThan(
      applyAction(open, { type: "attack" }).state.fighters[0].hp,
    );
  });
  it("validates path length, boundaries, occupied and blocked tiles", () => {
    const s = battle();
    expect(validateAction(s, { type: "move", x: 3, y: 2 })).toBeTruthy();
    expect(validateAction(s, { type: "move", x: -1, y: 2 })).toMatch(/Schema/);
    expect(validateAction(s, { type: "move", x: 2, y: 1 })).toBeTruthy();
    expect(validateAction(s, { type: "move", x: 6, y: 2 })).toBeTruthy();
    expect(reachable(s, 0, 2)).toContainEqual({ x: 2, y: 2 });
    s.fighters[0].root = 1;
    expect(validateAction(s, { type: "move", x: 1, y: 2 })).toMatch(/禁锢/);
  });
  it("spends energy, regenerates, ticks cooldown, heals and limits consumables", () => {
    let s = battle();
    s.fighters[1].x = 3;
    const r = applyAction(s, { type: "use_skill", skillId: "charge" });
    s = r.state;
    expect(s.fighters[0].energy).toBe(32);
    expect(s.fighters[0].cooldowns.charge).toBe(3);
    expect(s.fighters[0].x).toBe(2);
    s = applyAction(s, { type: "defend" }).state;
    expect(validateAction(s, { type: "use_skill", skillId: "charge" })).toMatch(
      /冷却/,
    );
    s.fighters[0].hp = 40;
    s = applyAction(s, { type: "use_item" }).state;
    expect(s.fighters[0].hp).toBe(68);
    expect(s.fighters[0].potion).toBe(0);
    expect(s.fighters[0].cooldowns.charge).toBe(2);
    s.active = 0;
    expect(validateAction(s, { type: "use_item" })).toBeTruthy();
    s.fighters[0].energy = 0;
    expect(validateAction(s, { type: "use_skill", skillId: "shield" })).toMatch(
      /能量/,
    );
  });
  it("guard and shields absorb damage; root prevents charge and blink", () => {
    const s = battle();
    s.fighters[1].x = 1;
    s.fighters[1].shield = 20;
    const r = applyAction(s, { type: "attack" });
    expect(r.state.fighters[1].hp).toBe(s.fighters[1].hp);
    expect(r.state.fighters[1].shield).toBeLessThan(20);
    s.fighters[1].shield = 0;
    const unguarded = applyAction(s, { type: "attack" }).state.fighters[1].hp;
    s.fighters[1].guard = true;
    expect(
      applyAction(s, { type: "attack" }).state.fighters[1].hp,
    ).toBeGreaterThan(unguarded);
    s.active = 1;
    s.fighters[1].root = 1;
    expect(
      validateAction(s, { type: "use_skill", skillId: "blink", x: 4, y: 2 }),
    ).toMatch(/禁锢/);
  });
  it("fireball damages an area and creates avoidable hazards", () => {
    const s = createBattle([PRESETS[2], PRESETS[0]], 77);
    s.fighters[1].x = 3;
    const r = applyAction(s, {
      type: "use_skill",
      skillId: "fireball",
      x: 3,
      y: 2,
    });
    expect(r.state.hazards).toHaveLength(5);
    expect(r.state.fighters[1].hp).toBeLessThan(100);
    const wait = applyAction(r.state, { type: "defend" });
    expect(wait.state.fighters[1].hp).toBeLessThan(r.state.fighters[1].hp);
    const escape = applyAction(r.state, { type: "move", x: 5, y: 2 });
    expect(escape.state.fighters[1].hp).toBe(r.state.fighters[1].hp);
  });
  it("rejects forged tools and attributes without mutating input", () => {
    const s = battle(),
      before = structuredClone(s);
    for (const a of [
      { type: "shell", cmd: "oops" },
      { type: "defend", hp: 999 },
      { type: "use_skill", skillId: "godmode" },
    ])
      expect(validateAction(s, a)).toMatch(/Schema/);
    expect(() => applyAction(s, { type: "attack" })).toThrow();
    expect(s).toEqual(before);
  });
  it("fixed action limit uses HP fraction and resolves ties as draws", () => {
    const s = createBattle([PRESETS[0], PRESETS[1]], 1, 2);
    const r = applyAction(applyAction(s, { type: "defend" }).state, {
      type: "defend",
    });
    expect(r.state.status).toBe("finished");
    expect(r.state.winner).toBeNull();
    s.fighters[1].hp -= 1;
    const win = applyAction(applyAction(s, { type: "defend" }).state, {
      type: "defend",
    });
    expect(win.state.winner).toBe(0);
    const kill = battle();
    kill.fighters[1].x = 1;
    kill.fighters[1].hp = 1;
    expect(applyAction(kill, { type: "attack" }).state.winner).toBe(0);
  });
  it("does not leak private prompts or background through observations", () => {
    const s = battle(),
      json = JSON.stringify(observation(s, 0));
    for (const c of PRESETS) {
      expect(json).not.toContain(c.prompt);
      expect(json).not.toContain(c.background);
    }
    expect(observation(s, 1).legalActions).toEqual([]);
  });
  it("all matchups finish; recorded actions reproduce every snapshot and RNG byte for byte", () => {
    for (const a of PRESETS)
      for (const b of PRESETS) {
        let s = createBattle([a, b], 99),
          replay = structuredClone(s);
        let count = 0;
        while (s.status === "running") {
          const before = structuredClone(s),
            action = chooseDemo(s, [a, b][s.active]);
          expect(legalActions(s).length).toBeGreaterThan(0);
          expect(validateAction(s, action)).toBeNull();
          const r = applyAction(s, action),
            rr = applyAction(replay, action);
          expect(s).toEqual(before);
          expect(r).toEqual(rr);
          s = r.state;
          replay = rr.state;
          for (const f of s.fighters) {
            expect(f.hp).toBeGreaterThanOrEqual(0);
            expect(f.energy).toBeGreaterThanOrEqual(0);
            expect(f.energy).toBeLessThanOrEqual(f.stats.energy);
          }
          expect(++count).toBeLessThanOrEqual(80);
        }
        expect(s.status).toBe("finished");
      }
  });
});
