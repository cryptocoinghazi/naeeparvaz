import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getRuntimeEnv } from "./runtime";

let pool: Pool | undefined;
let poolUrl: string | undefined;

export function getDatabase(_locals?: App.Locals): Pool | undefined {
  const databaseUrl = getRuntimeEnv().DATABASE_URL?.trim();
  if (!databaseUrl) return undefined;
  if (!pool || poolUrl !== databaseUrl) {
    poolUrl = databaseUrl;
    pool = new Pool({
      connectionString: databaseUrl,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on("error", (error) => console.error("Unexpected PostgreSQL pool error", error));
  }
  return pool;
}

export async function withTransaction<T>(
  locals: App.Locals,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const database = getDatabase(locals);
  if (!database) throw new Error("The PostgreSQL DATABASE_URL is unavailable.");
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function databaseIsReady(locals?: App.Locals): Promise<boolean> {
  const database = getDatabase(locals);
  if (!database) return false;
  try {
    await database.query("SELECT 1");
    return true;
  } catch (error) {
    console.error("PostgreSQL readiness check failed", error);
    return false;
  }
}

export function rows<T extends QueryResultRow>(result: { rows: T[] }): T[] {
  return result.rows;
}

export function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
