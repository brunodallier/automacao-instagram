import { readFile } from "node:fs/promises";

// Fixed, optional, read-only mount. Never read .env or replace the active secret.
export async function webhookDiagnosticCandidate(enabled: boolean) {
  if (!enabled) return undefined;
  try {
    const candidate = (await readFile("/run/secrets/instagram_diagnostic_candidate", "utf8")).trim();
    return /^[a-fA-F0-9]{32}$/.test(candidate) ? candidate : undefined;
  } catch {
    // Missing/inaccessible candidate must not affect normal authentication.
    return undefined;
  }
}
