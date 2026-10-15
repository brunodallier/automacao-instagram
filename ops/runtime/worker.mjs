import pg from "pg";
import { writeFileSync, rmSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
if (["controlled", "live"].includes(process.env.INSTAGRAM_SEND_MODE)) {
  try { const { runAutomationWorker } = await import("../../dist/automation-worker.mjs"); await runAutomationWorker(); }
  catch { console.error(JSON.stringify({ event: "worker_configuration_unavailable" })); process.exitCode = 1; }
} else {
const health = "/tmp/pulso-worker-health.json";
const abort = new AbortController();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, query_timeout: 5000, options: "-c default_transaction_read_only=on" });
pool.on("error", () => {});
let failures = 0;
let lastLog = 0;
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => abort.abort());
console.log(JSON.stringify({ event: "worker_started", mode: "standby", executionEnabled: false }));
try {
  while (!abort.signal.aborted) {
    try {
      const result = await pool.query("SELECT current_setting('server_encoding') AS encoding");
      if (result.rows[0]?.encoding !== "UTF8") throw new Error();
      failures = 0;
      writeFileSync(health, JSON.stringify({ mode: "standby", executionEnabled: false, updatedAt: Date.now() }));
      if (Date.now() - lastLog >= 60000) {
        console.log(JSON.stringify({ event: "worker_heartbeat", mode: "standby", executionEnabled: false })); lastLog = Date.now();
      }
    } catch {
      rmSync(health, { force: true });
      console.error(JSON.stringify({ event: "worker_database_unavailable", attempts: ++failures }));
      if (failures >= 5) { process.exitCode = 1; break; }
    }
    await delay(15000, undefined, { signal: abort.signal }).catch(() => {});
  }
} finally { rmSync(health, { force: true }); await pool.end(); }
}
