import { writeFileSync, rmSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { createDatabaseClient } from "../src/lib/db";
import { automationEngine } from "../src/lib/instagram/execution/engine";
import {
  executionSettings,
  executionConfigured,
} from "../src/lib/instagram/execution/config";
import { runtimeCredentialProvider } from "../src/lib/instagram/execution/credentials";
import { graphTransport } from "../src/lib/instagram/execution/transport";

export async function runAutomationWorker() {
  const health = "/tmp/pulso-worker-health.json",
    abort = new AbortController();
  const client = createDatabaseClient(process.env.DATABASE_URL!, 1);
  const settings = executionSettings(),
    provider = runtimeCredentialProvider(process.env);
  const engine = automationEngine(client, {
    settings,
    transport: graphTransport(provider, settings),
  });
  let failures = 0,
    lastHeartbeat = 0,
    lastLog = 0;
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => abort.abort());
  console.log(
    JSON.stringify({
      event: "worker_started",
      mode: settings.mode,
      configured: executionConfigured(settings),
      executionEnabled: false,
    }),
  );
  try {
    while (!abort.signal.aborted) {
      try {
        if (Date.now() - lastHeartbeat >= 15000) {
          const credential = await provider.getCredential();
          const available = !!credential && (await engine.heartbeat());
          const mode = available ? "execution" : "blocked";
          writeFileSync(
            health,
            JSON.stringify({
              mode,
              executionEnabled: available,
              updatedAt: Date.now(),
            }),
          );
          lastHeartbeat = Date.now();
          if (Date.now() - lastLog >= 60000) {
            console.log(
              JSON.stringify({
                event: "worker_heartbeat",
                mode,
                executionEnabled: available,
              }),
            );
            lastLog = Date.now();
          }
        }
        const processed = await engine.processOne();
        failures = 0;
        if (!processed)
          await delay(1000, undefined, { signal: abort.signal }).catch(
            () => {},
          );
      } catch {
        rmSync(health, { force: true });
        console.error(
          JSON.stringify({
            event: "worker_processing_unavailable",
            attempts: ++failures,
          }),
        );
        if (failures >= 5) {
          process.exitCode = 1;
          break;
        }
        await delay(5000, undefined, { signal: abort.signal }).catch(() => {});
      }
    }
  } finally {
    rmSync(health, { force: true });
    await client.$disconnect();
  }
}
