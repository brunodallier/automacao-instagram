import { spawn } from "node:child_process";
import { loadRuntimeSecrets } from "./secrets.mjs";
try {
  const [command, ...args] = process.argv.slice(2);
  if (!command) throw new Error();
  const child = spawn(command, args, { env: loadRuntimeSecrets(process.env), stdio: "inherit" });
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
  child.on("error", () => { console.error("Não foi possível iniciar o serviço."); process.exitCode = 1; });
  child.on("exit", (code, signal) => process.exit(signal ? (signal === "SIGTERM" || signal === "SIGINT" ? 0 : 1) : code ?? 1));
} catch { console.error("Configuração privada do serviço indisponível ou inválida."); process.exitCode = 1; }
