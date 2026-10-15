// Gera configuração local; nunca conecta Tunnel ou modifica a conta/DNS.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, renameSync, rmSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { buildTunnelConfiguration, validateAccessState, validateTunnelCredentials } from "./config.mjs";
let staging;
try {
  const [stateFile, outputDirectory] = process.argv.slice(2);
  if (!stateFile || !outputDirectory) throw new Error();
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  const { audience } = validateAccessState(state);
  validateTunnelCredentials(state.credentials, state.tunnelId, state.accountId);
  const config = buildTunnelConfiguration({ ...state, audience });
  const directory = resolve(outputDirectory);
  if (existsSync(directory)) throw new Error();
  mkdirSync(dirname(directory), { recursive: true, mode: 0o700 });
  staging = mkdtempSync(join(dirname(directory), ".cloudflare-stage-"));
  // Não sobrescrever configuração/credenciais existentes em uma atualização.
  writeFileSync(resolve(staging, "config.json"), JSON.stringify(config, null, 2), { mode: 0o600, flag: "wx" });
  writeFileSync(resolve(staging, "tunnel_credentials"), JSON.stringify(state.credentials), { mode: 0o600, flag: "wx" });
  renameSync(staging, directory);
  staging = undefined;
  console.log("Configuração privada gerada; nenhum Tunnel conectado ou DNS alterado.");
} catch {
  console.error("Não foi possível preparar o Tunnel. Verifique o estado real do Access e os arquivos privados; detalhes e credenciais não foram exibidos.");
  process.exitCode = 1;
} finally {
  if (staging && basename(staging).startsWith(".cloudflare-stage-") && dirname(staging) === dirname(resolve(process.argv[3]))) rmSync(staging, { recursive: true });
}
