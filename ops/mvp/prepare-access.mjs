// Gera a credencial adicional fora do repositório; não altera a senha do proprietário.
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, chmodSync, rmSync } from "node:fs";
import { resolve, relative, isAbsolute, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

export async function prepareAccess(destination, root = resolve(".")) {
  const directory = resolve(destination);
  const inside = relative(root, directory);
  if (!inside || (inside !== ".." && !inside.startsWith(".." + sep) && !isAbsolute(inside))) {
    throw new Error("Use um diretório privado fora do repositório.");
  }
  const credential = join(directory, "panel-access.private.json");
  const users = join(directory, "panel_users");
  if (existsSync(credential) || existsSync(users)) throw new Error("Credencial existente: nenhuma substituição foi feita.");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") chmodSync(directory, 0o700);
  const password = randomBytes(32).toString("base64url");
  const hash = await new Promise((ok, fail) => {
    const child = spawn("docker", ["run", "--rm", "-i", "--network", "none", "--read-only", "--cap-drop", "ALL", "--cap-add", "NET_BIND_SERVICE", "--security-opt", "no-new-privileges:true", "--memory", "128m", "caddy:2.11.2-alpine", "caddy", "hash-password", "--algorithm", "argon2id"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", data => { stdout += data; });
    // Não reproduzir a saída de erro de um processo que recebeu uma credencial.
    child.stderr.resume(); child.on("error", () => fail(new Error("Docker indisponível para gerar o hash.")));
    child.on("exit", code => code === 0 && /^\$argon2id\$v=19\$[^\s]+$/.test(stdout.trim()) ? ok(stdout.trim()) : fail(new Error("Não foi possível gerar um hash Argon2id válido.")));
    child.stdin.on("error", () => {}); child.stdin.end(password + "\n");
  });
  let createdCredential = false;
  try {
    writeFileSync(credential, JSON.stringify({ username: "pulso", password }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    createdCredential = true;
    writeFileSync(users, `pulso ${hash}\n`, { flag: "wx", mode: 0o600 });
  } catch {
    // O diretório não continha esses arquivos antes da geração; remover só criação parcial.
    if (createdCredential) rmSync(credential);
    throw new Error("Falha ao salvar a credencial privada; verifique o diretório antes de tentar novamente.");
  }
  return { credentialFile: credential, hashFile: users, algorithm: "argon2id" };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv[2]) throw new Error("Informe o diretório privado de destino. No Windows, use uma pasta com ACL restrita ao proprietário e SYSTEM.");
    console.log(JSON.stringify(await prepareAccess(process.argv[2]), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
