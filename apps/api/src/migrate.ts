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
    { name: "002_competitive_features", path: resolve(here, "../db/migrations/002_competitive_features.sql") }
  ];
  const client = await dbPool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(73190421)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS rateit_schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
    );

    for (const migration of migrations) {
      const existing = await client.query(
        "SELECT 1 FROM rateit_schema_migrations WHERE name = $1",
        [migration.name]
      );
      if (existing.rowCount) {
        console.log(`Пропуск ${migration.name}: уже применена.`);
        continue;
      }

      const sql = await readFile(migration.path, "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO rateit_schema_migrations(name) VALUES ($1)",
          [migration.name]
        );
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
