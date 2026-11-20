import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { dbPool } from "./db.js";

if (!dbPool) {
  console.error("DATABASE_URL не задан. Миграции не запускались.");
  process.exitCode = 1;
} else {
  const here = dirname(fileURLToPath(import.meta.url));
  const migrations = [
    { name: "001_initial_schema", path: resolve(here, "../db/schema.sql") },
    { name: "002_competitive_features", path: resolve(here, "../db/migrations/002_competitive_features.sql") },
    { name: "003_telegram_auth", path: resolve(here, "../db/migrations/003_telegram_auth.sql") },
    { name: "004_accounts", path: resolve(here, "../db/migrations/004_accounts.sql") },
    { name: "005_standoff2_id_immutable", path: resolve(here, "../db/migrations/005_standoff2_id_immutable.sql") },
    { name: "006_party_invites", path: resolve(here, "../db/migrations/006_party_invites.sql") },
    { name: "007_matchmaking_queue", path: resolve(here, "../db/migrations/007_matchmaking_queue.sql") },
    { name: "008_telegram_auth_purpose", path: resolve(here, "../db/migrations/008_telegram_auth_purpose.sql") },
    { name: "009_telegram_registration_tickets", path: resolve(here, "../db/migrations/009_telegram_registration_tickets.sql") }
  ];
  const client = await dbPool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(73190421)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS rateit_schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
    );
    for (const migration of migrations) {
      const existing = await client.query("SELECT 1 FROM rateit_schema_migrations WHERE name = $1", [migration.name]);
      if (existing.rowCount) {
        console.log(`Пропуск ${migration.name}: уже применена.`);
        continue;
      }
      const sql = await readFile(migration.path, "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO rateit_schema_migrations(name) VALUES ($1)", [migration.name]);
        await client.query("COMMIT");
        console.log(`Применена ${migration.name}.`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } catch (error) {
    console.error("Ошибка миграции RATEIT:", error);
    process.exitCode = 1;
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(73190421)"); } catch {}
    client.release();
    await dbPool.end();
  }
}
