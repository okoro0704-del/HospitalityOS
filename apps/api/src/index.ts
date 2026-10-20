import { config } from "./config.js";
import { buildApp } from "./app.js";
import { runStartupPreflight, StartupPreflightError } from "./startup/preflight.js";
import { describeMigrationReport } from "./lib/migration-status.js";

export { buildApp } from "./app.js";

async function start() {
  const migrations = await runStartupPreflight();
  if (migrations) console.log(`[startup] ${config.env}: migrations verified (${describeMigrationReport(migrations)})`);
  const app = await buildApp();
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`HospitalityOS API listening on http://${config.host}:${config.port}`);
  return app;
}

start().catch((err) => {
  if (err instanceof StartupPreflightError) {
    console.error(`[startup] HospitalityOS refused to start: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
