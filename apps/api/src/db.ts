import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

// База не создаётся автоматически: подключение появляется только после
// явной настройки DATABASE_URL в окружении сервера.
export const dbPool = connectionString
  ? new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000
    })
  : null;

export async function checkDatabase(): Promise<boolean> {
  if (!dbPool) return false;
  const client = await dbPool.connect();
  try {
    await client.query("SELECT 1");
    return true;
  } finally {
    client.release();
  }
}
