// PostgreSQL novo e exclusivo: não lê .env, não usa Instagram real nem remove outros containers.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, relative } from "node:path";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
const directory = mkdtempSync(join(tmpdir(), "pulso-execution-test-")),
  name = `pulso-execution-test-${randomBytes(5).toString("hex")}`,
  password = randomBytes(32).toString("hex");
const redact = (value) => value.replaceAll(password, "[fixture-redacted]");
async function run(command, args, { env = process.env, stream = false } = {}) {
  return new Promise((ok, fail) => {
    const p = spawn(command, args, {
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    for (const pipe of [p.stdout, p.stderr])
      pipe.on("data", (v) => {
        out += v;
        if (stream) process.stdout.write(redact(v.toString()));
      });
    p.on("error", fail);
    p.on("exit", (code) =>
      code === 0
        ? ok(out)
        : fail(
            new Error(
              stream
                ? "Testes falharam; diagnóstico exibido acima."
                : redact(out),
            ),
          ),
    );
  });
}
const docker = (...args) => run("docker", args);
async function others() {
  const ids = (await docker("ps", "-aq")).trim().split(/\s+/).filter(Boolean);
  if (!ids.length) return [];
  return JSON.parse(await docker("inspect", ...ids))
    .filter((v) => v.Name !== `/${name}`)
    .map((v) => ({
      id: v.Id,
      started: v.State.StartedAt,
      restarts: v.RestartCount,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
const before = await others();
let created = false;
try {
  const pgEnv = join(directory, "postgres.env");
  writeFileSync(
    pgEnv,
    `POSTGRES_USER=pulso\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=pulso_execution_test\nPOSTGRES_INITDB_ARGS=--encoding=UTF8 --locale=C.UTF-8 --data-checksums\n`,
    { mode: 0o600 },
  );
  await docker(
    "run",
    "-d",
    "--name",
    name,
    "--env-file",
    pgEnv,
    "--memory",
    "512m",
    "--cpus",
    "1",
    "--publish",
    "127.0.0.1::5432",
    "postgres:18.6-bookworm",
  );
  created = true;
  const until = Date.now() + 60000;
  let ready = false;
  while (Date.now() < until) {
    try {
      await docker(
        "exec",
        name,
        "pg_isready",
        "-U",
        "pulso",
        "-d",
        "pulso_execution_test",
      );
      ready = true;
      break;
    } catch {
      await delay(1000);
    }
  }
  assert.ok(ready, "PostgreSQL isolado indisponível");
  const info = JSON.parse(await docker("inspect", name))[0],
    port = info.NetworkSettings.Ports["5432/tcp"][0].HostPort;
  const url = `postgresql://pulso:${password}@127.0.0.1:${port}/pulso_execution_test`;
  const fixture = join(directory, "test.env");
  writeFileSync(
    fixture,
    `TEST_DATABASE_URL=${url}\nDATABASE_URL=postgresql://localhost:1/pulso_sentinel\nINSTAGRAM_SEND_MODE=disabled\nINSTAGRAM_WEBHOOK_ENABLED=false\n`,
    { mode: 0o600 },
  );
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (
      /^(INSTAGRAM_|DATABASE_URL|TEST_DATABASE_URL|NEXTAUTH_SECRET)/.test(key)
    )
      delete env[key];
  env.DOTENV_CONFIG_PATH = fixture;
  env.TEST_DATABASE_URL = url;
  env.DATABASE_URL = "postgresql://localhost:1/pulso_sentinel";
  console.log(
    "Integração: PostgreSQL UTF8 descartável, sem .env ou token real",
  );
  const browser = process.argv.includes("--e2e");
  const files = process.argv.slice(2).filter((arg) => arg !== "--e2e");
  assert.ok(
    files.every((v) => /^tests\/integration\/[a-z-]+\.test\.ts$/.test(v)),
  );
  assert.ok(
    !browser || !files.length,
    "Não misturar filtros de integração e navegador",
  );
  await run(
    process.execPath,
    browser
      ? ["node_modules/tsx/dist/cli.mjs", "scripts/test-e2e.ts"]
      : [
          "node_modules/vitest/vitest.mjs",
          "run",
          "--config",
          "vitest.integration.config.ts",
          ...files,
        ],
    { env, stream: true },
  );
  assert.equal(
    (
      await docker(
        "exec",
        name,
        "psql",
        "-U",
        "pulso",
        "-d",
        "pulso_execution_test",
        "-At",
        "-c",
        "SHOW server_encoding",
      )
    ).trim(),
    "UTF8",
  );
} catch (error) {
  console.error(redact(error.message));
  process.exitCode = 1;
} finally {
  assert.match(name, /^pulso-execution-test-[a-f0-9]{10}$/);
  if (created) await docker("rm", "-f", "-v", name);
  assert.deepEqual(await others(), before, "Outro projeto foi alterado");
  assert.match(
    relative(resolve(tmpdir()), resolve(directory)),
    /^pulso-execution-test-[^/\\]+$/,
  );
  rmSync(directory, { recursive: true, force: true });
}
