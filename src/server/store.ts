import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  characterSchema,
  PRESETS,
  type Character,
  type Match,
  type Standing,
} from "../shared/model.js";

export class Store {
  db: DatabaseSync;
  constructor(path = "data/arena.sqlite") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS characters(id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY, json TEXT NOT NULL, settled INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS standings(id TEXT, mode TEXT, name TEXT, elo REAL DEFAULT 1000, wins INTEGER DEFAULT 0, losses INTEGER DEFAULT 0, draws INTEGER DEFAULT 0, games INTEGER DEFAULT 0, PRIMARY KEY(id,mode));`);
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO characters VALUES(?,?)",
    );
    for (const c of PRESETS)
      insert.run(c.id, JSON.stringify(characterSchema.parse(c)));
  }
  characters(): Character[] {
    return (
      this.db.prepare("SELECT json FROM characters ORDER BY rowid").all() as {
        json: string;
      }[]
    ).map((x) => JSON.parse(x.json));
  }
  character(id: string): Character | undefined {
    const row = this.db
      .prepare("SELECT json FROM characters WHERE id=?")
      .get(id) as { json: string } | undefined;
    return row && JSON.parse(row.json);
  }
  saveCharacter(raw: unknown): Character {
    const c = characterSchema.parse(raw),
      old = this.character(c.id);
    c.id = c.id || randomUUID();
    c.version = old ? old.version + 1 : 1;
    this.db
      .prepare(
        "INSERT INTO characters VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json",
      )
      .run(c.id, JSON.stringify(c));
    return c;
  }
  saveMatch(m: Match) {
    this.db
      .prepare(
        "INSERT INTO matches(id,json,settled) VALUES(?,?,0) ON CONFLICT(id) DO UPDATE SET json=excluded.json",
      )
      .run(m.id, JSON.stringify(m));
  }
  match(id: string): Match | undefined {
    const row = this.db
      .prepare("SELECT json,settled FROM matches WHERE id=?")
      .get(id) as { json: string; settled: number } | undefined;
    return row
      ? { ...JSON.parse(row.json), settled: !!row.settled }
      : undefined;
  }
  matches(): Match[] {
    return (
      this.db
        .prepare(
          "SELECT json,settled FROM matches ORDER BY rowid DESC LIMIT 100",
        )
        .all() as { json: string; settled: number }[]
    ).map((r) => ({ ...JSON.parse(r.json), settled: !!r.settled }));
  }
  standings(mode = "demo"): Standing[] {
    return this.db
      .prepare(
        "SELECT id,name,elo,wins,losses,draws,games FROM standings WHERE mode=? ORDER BY elo DESC",
      )
      .all(mode) as unknown as Standing[];
  }
  settle(id: string): boolean {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const m = this.match(id);
      if (
        !m ||
        m.settled ||
        m.status !== "completed" ||
        !m.rated ||
        m.participants[0].id === m.participants[1].id
      ) {
        this.db.exec("COMMIT");
        return false;
      }
      for (const c of m.participants)
        this.db
          .prepare(
            "INSERT INTO standings(id,mode,name) VALUES(?,?,?) ON CONFLICT(id,mode) DO UPDATE SET name=excluded.name",
          )
          .run(c.id, m.mode, c.name);
      const rating = (c: Character) =>
        (
          this.db
            .prepare("SELECT elo FROM standings WHERE id=? AND mode=?")
            .get(c.id, m.mode) as { elo: number }
        ).elo;
      const [a, b] = m.participants,
        ra = rating(a),
        rb = rating(b);
      const score =
        m.state.winner === null ? 0.5 : m.state.winner === 0 ? 1 : 0;
      const delta = 24 * (score - 1 / (1 + 10 ** ((rb - ra) / 400)));
      const update = this.db.prepare(
        "UPDATE standings SET elo=elo+?,games=games+1,wins=wins+?,losses=losses+?,draws=draws+? WHERE id=? AND mode=?",
      );
      update.run(
        delta,
        +(score === 1),
        +(score === 0),
        +(score === 0.5),
        a.id,
        m.mode,
      );
      update.run(
        -delta,
        +(score === 0),
        +(score === 1),
        +(score === 0.5),
        b.id,
        m.mode,
      );
      m.settled = true;
      this.db
        .prepare("UPDATE matches SET settled=1,json=? WHERE id=?")
        .run(JSON.stringify(m), id);
      this.db.exec("COMMIT");
      return true;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  recoverInterrupted() {
    for (const m of this.matches())
      if (m.status === "running" || m.status === "queued") {
        m.status = "failed";
        m.error = "服务重启中断比赛。可从相同参赛快照重试。";
        this.saveMatch(m);
      }
  }
  close() {
    this.db.close();
  }
}
