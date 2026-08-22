import { runMigrations } from "./migrate.mjs";

process.env.NODE_ENV = "production";
await runMigrations();
await import("../dist/server/entry.mjs");
