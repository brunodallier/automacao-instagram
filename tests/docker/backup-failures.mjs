// Casos de falha adicionais; não carrega .env, dump real ou credenciais da VPS.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "pulso-backup-failures-"));
const volume = `pulso-backup-failures-${randomBytes(5).toString("hex")}`;
const password = randomBytes(32).toString("hex");
const wrongPassword = randomBytes(32).toString("hex");
const secret = join(directory, "correct"), wrong = join(directory, "wrong"), empty = join(directory, "empty");
for (const [file, value] of [[secret, password], [wrong, wrongPassword], [empty, ""]]) writeFileSync(file, value, { mode: 0o444 });
const redact = output => [password, wrongPassword].reduce((text, value) => text.replaceAll(value, "[redacted]"), output);
async function docker(args, allowFailure = false) {
  const result = await new Promise((ok, fail) => {
    const child = spawn("docker", args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    child.on("error", fail); child.on("exit", code => ok({ code, output }));
  });
  if (!allowFailure && result.code !== 0) throw new Error(redact(result.output));
  return result;
}
async function unchangedProjects() {
  const ids = (await docker(["ps", "-aq"])).output.trim().split(/\s+/).filter(Boolean);
  if (!ids.length) return [];
  return JSON.parse((await docker(["inspect", ...ids])).output).map(container => ({ id: container.Id, started: container.State.StartedAt, restarts: container.RestartCount })).sort((a, b) => a.id.localeCompare(b.id));
}
async function backup(mode, key = secret, repository = "/repository") {
  const result = await docker([
    "run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--memory", "256m", "--cpus", "0.25", "--pids-limit", "64",
    "--tmpfs", "/tmp:size=64m,mode=1777", "--tmpfs", "/root/.cache/restic:size=32m,mode=0700",
    "--mount", `type=volume,src=${volume},dst=/repository`,
    "--mount", `type=bind,src=${key},dst=/run/secrets/restic_password,readonly`,
    ...["postgres_password", "s3_access_key", "s3_secret_key"].flatMap(name => ["--mount", `type=bind,src=${empty},dst=/run/secrets/${name},readonly`]),
    "--env", `RESTIC_REPOSITORY=${repository}`, "pulso:backup", mode,
  ], true);
  for (const value of [password, wrongPassword]) assert.equal(result.output.includes(value), false, "Senha de teste apareceu na saída");
  return result;
}
async function repositoryFingerprint() {
  return (await docker(["run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--mount", `type=volume,src=${volume},dst=/repository,readonly`, "--entrypoint", "bash", "pulso:backup", "-c", "find /repository -type f -exec sha256sum '{}' + | sort | sha256sum"])).output.trim();
}
let created = false, before;
try {
  before = await unchangedProjects();
  await docker(["volume", "create", "--label", "pulso.disposable-backup-test=true", volume]); created = true;
  const original = await repositoryFingerprint();
  for (const [key, repository] of [[secret, ""], [empty, "/repository"]]) {
    const result = await backup("once", key, repository);
    assert.notEqual(result.code, 0); assert.equal(result.output.trim(), '{"event":"backup_configuration_missing"}');
    assert.equal(await repositoryFingerprint(), original);
  }
  const unavailable = await backup("check");
  assert.notEqual(unavailable.code, 0); assert.equal(unavailable.output.trim(), '{"event":"backup_command_failed"}');
  assert.equal(await repositoryFingerprint(), original);
  assert.equal((await backup("init")).code, 0);
  const initialized = await repositoryFingerprint();
  const denied = await backup("check", wrong);
  assert.notEqual(denied.code, 0); assert.equal(denied.output.trim(), '{"event":"backup_command_failed"}');
  assert.equal(await repositoryFingerprint(), initialized, "A tentativa com senha inválida alterou o repositório");
  assert.equal((await backup("check")).code, 0, "A chave correta deve continuar recuperando o repositório");
  assert.equal(await repositoryFingerprint(), initialized);
  console.log("Backup: configuração ausente e senha incorreta recusadas sem expor segredos ou alterar o repositório; integridade com chave correta preservada.");
} finally {
  if (created) {
    assert.match(volume, /^pulso-backup-failures-[a-f0-9]{10}$/);
    const metadata = JSON.parse((await docker(["volume", "inspect", volume])).output)[0];
    assert.equal(metadata.Labels?.["pulso.disposable-backup-test"], "true");
    await docker(["volume", "rm", volume]);
  }
  if (before) assert.deepEqual(await unchangedProjects(), before, "Um contêiner existente mudou durante o teste");
  assert.match(relative(resolve(tmpdir()), resolve(directory)), /^pulso-backup-failures-[^/\\]+$/);
  rmSync(directory, { recursive: true, force: true });
}
