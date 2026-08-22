import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from "pg";
import { getRuntimeEnv } from "./runtime";

let pool: Pool | undefined;
let poolKey: string | undefined;

function connectionConfig(databaseUrl: string, databaseCaCert?: string): PoolConfig {
  const ca = databaseCaCert?.trim();
  if (!ca) return { connectionString: databaseUrl };

  const parsedUrl = new URL(databaseUrl);
  for (const parameter of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
    parsedUrl.searchParams.delete(parameter);
  }

  return {
    connectionString: parsedUrl.toString(),
    ssl: { ca, rejectUnauthorized: true },
  };
}

export function getDatabase(_locals?: App.Locals): Pool | undefined {
  const runtime = getRuntimeEnv();
  const databaseUrl = runtime.DATABASE_URL?.trim();
  if (!databaseUrl) return undefined;
  const databaseCaCert = runtime.DATABASE_CA_CERT?.trim();
  const currentPoolKey = `${databaseUrl}\u0000${databaseCaCert ?? ""}`;
  if (!pool || poolKey !== currentPoolKey) {
    poolKey = currentPoolKey;
    pool = new Pool({
      ...connectionConfig(databaseUrl, databaseCaCert),
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
