import { readFileSync } from "node:fs";
try {
  const state = JSON.parse(readFileSync("/tmp/pulso-worker-health.json", "utf8"));
  const expected = (state.mode === "standby" || state.mode === "blocked") ? state.executionEnabled === false : state.mode === "execution" && state.executionEnabled === true;
  process.exitCode = expected && Date.now() - state.updatedAt < 45000 ? 0 : 1;
} catch { process.exitCode = 1; }
