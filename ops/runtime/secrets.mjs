import { readFileSync } from "node:fs";

const names = ["DATABASE_URL", "NEXTAUTH_SECRET", "INSTAGRAM_ACCESS_TOKEN"];
export function loadRuntimeSecrets(environment, read = readFileSync) {
  const result = { ...environment };
  for (const name of names) {
    const file = environment[`${name}_FILE`];
    if (!file) continue;
    if (environment[name]) throw new Error("Configuração ambígua de credenciais.");
    let value;
    try { value = read(file, "utf8").trim(); } catch { throw new Error("Não foi possível carregar a configuração privada."); }
    if (name !== "INSTAGRAM_ACCESS_TOKEN" && !value) throw new Error("Configuração privada obrigatória ausente.");
    if (name === "NEXTAUTH_SECRET" && value.length < 32) throw new Error("Segredo de sessão inválido.");
    result[name] = value;
  }
  return result;
}
