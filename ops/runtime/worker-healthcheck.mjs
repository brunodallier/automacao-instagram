import { readFileSync } from "node:fs";
try {
  const state = JSON.parse(readFileSync("/tmp/pulso-worker-health.json", "utf8"));
  process.exitCode = state.mode === "standby" && state.executionEnabled === false && Date.now() - state.updatedAt < 45000 ? 0 : 1;
} catch { process.exitCode = 1; }
