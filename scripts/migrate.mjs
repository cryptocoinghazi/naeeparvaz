import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { Pool } from "pg";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = resolve(scriptDirectory, "../db/migrations");

export async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required before database migrations can run.");
  const databaseCaCert = process.env.DATABASE_CA_CERT?.trim();
  const parsedUrl = new URL(databaseUrl);
  if (databaseCaCert) {
    for (const parameter of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
      parsedUrl.searchParams.delete(parameter);
    }
  }

  const pool = new Pool({
    connectionString: parsedUrl.toString(),
    ...(databaseCaCert ? { ssl: { ca: databaseCaCert, rejectUnauthorized: true } } : {}),
    max: 1,
    connectionTimeoutMillis: 15_000,
  });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", ["naee-parvaz-schema-migrations"]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const appliedResult = await client.query("SELECT name FROM schema_migrations");
    const applied = new Set(appliedResult.rows.map((row) => row.name));
    const files = (await readdir(migrationsDirectory))
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(resolve(migrationsDirectory, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`Applied database migration: ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", ["naee-parvaz-schema-migrations"]);
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runMigrations().catch((error) => {
    console.error("Database migration failed", error);
    process.exitCode = 1;
  });
}
