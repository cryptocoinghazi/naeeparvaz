import { runMigrations } from "./migrate.mjs";

process.env.NODE_ENV = "production";
await runMigrations();
await import("../dist/server/entry.mjs");
// Keep maintenance in this existing service: no separate process, job or infrastructure.
try {
  const { tsImport } = await import('tsx/esm/api');
  const { reporterMaintenance } = await tsImport('../src/lib/reporter-maintenance.ts', import.meta.url);
  const { startMaintenanceTimer } = await tsImport('../src/lib/reporter-schedule.ts', import.meta.url);
  startMaintenanceTimer(async () => {
    const result = await reporterMaintenance({source:'automatic'});
    if (['succeeded','partial','failed'].includes(result)) console.log(`Reporter maintenance: ${result}`);
  });
  // Leave signal handling to the web server; the unref'ed timer cannot keep it alive.
} catch {
  console.error('Reporter maintenance scheduler could not start. Check deployment dependencies.');
}
