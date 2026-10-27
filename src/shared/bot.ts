import { distance, legalActions, lineOfSight, same } from "./engine.js";
import type { Action, BattleState, Character } from "./model.js";
// Transparent baseline: style is a UI setting. Freeform prompt is NOT interpreted here.
export function chooseDemo(s: BattleState, c: Character): Action {
  const me = s.fighters[s.active],
    enemy = s.fighters[1 - s.active],
    d = distance(me, enemy);
  const cautious = c.style === "cautious",
    aggressive = c.style === "aggressive";
  const actions = legalActions(s);
  const score = (a: Action): number => {
    if (a.type === "use_item")
      return me.hp / me.stats.hp < (cautious ? 0.62 : 0.38) ? 120 : -20;
    if (a.type === "attack") return 45;
    if (a.type === "defend") return me.energy < 12 ? 22 : -10;
    if (a.type === "use_skill") {
      if (a.skillId === "heal") return me.hp <= me.stats.hp - 25 ? 90 : -20;
      if (a.skillId === "shield")
        return me.hp < me.stats.hp * 0.65 && d < 4 ? 65 : 5;
      if (a.skillId === "fireball")
        return distance(a as { x: number; y: number }, enemy) <= 1 &&
          distance(a as { x: number; y: number }, me) > 1
          ? 65
          : -50;
      if (a.skillId !== "blink") return a.skillId === "charge" ? 55 : 62;
    }
    const p = a as { x: number; y: number };
    const nd = distance(p, enemy);
    const ideal =
      me.stats.range > 1
        ? cautious
          ? me.stats.range
          : Math.max(2, me.stats.range - 1)
        : 1;
    let v = 25 - Math.abs(nd - ideal) * 6 + (lineOfSight(s, p, enemy) ? 4 : -4);
    if (me.stats.range > 1 && d <= 1 && nd >= 3) v += cautious ? 42 : 15;
    if (aggressive && nd < d) v += 5;
    if (s.hazards.some((h) => same(h, p))) v -= 30;
    if (a.type === "use_skill") v -= 6;
    return v;
  };
  const chosen = actions
    .map((a) => ({ a, v: score(a) }))
    .sort((a, b) => b.v - a.v)[0].a;
  return {
    ...chosen,
    intent:
      chosen.type === "move" ||
      (chosen.type === "use_skill" && chosen.skillId === "blink")
        ? "调整距离与视线，争取有利位置。"
        : chosen.type === "defend"
          ? "防御并恢复资源。"
          : "根据可用技能、射程与生命状态行动。",
  };
}
