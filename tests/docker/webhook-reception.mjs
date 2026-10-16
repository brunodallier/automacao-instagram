// Homologação SOMENTE de recepção. Não lê .env, não usa segredos/dados reais nem contata Meta.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, createHmac } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { createServer } from "node:net";
import { request } from "node:https";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve("."),
  directory = mkdtempSync(join(tmpdir(), "pulso-webhook-reception-"));
const project = `pulso-webhook-reception-${randomBytes(5).toString("hex")}`;
const password = randomBytes(32).toString("hex"),
  session = randomBytes(32).toString("hex");
const appSecret = randomBytes(16).toString("hex"),
  verify = randomBytes(32).toString("hex");
const candidate = randomBytes(16).toString("hex");
const privateValues = [password, session, appSecret, verify, candidate];
const redact = (text) =>
  privateValues.reduce(
    (value, secret) => value.replaceAll(secret, "[fixture-redacted]"),
    text,
  );
async function docker(args, { allowFailure = false } = {}) {
  return new Promise((ok, fail) => {
    const child = spawn("docker", args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (part) => (output += part));
    child.stderr.on("data", (part) => (output += part));
    child.on("error", fail);
    child.on("exit", (code) => {
      if (allowFailure) ok({ code, output: redact(output) });
      else if (code === 0) ok(output);
      else fail(Error(redact(output)));
    });
  });
}
async function freePort() {
  const server = createServer();
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const port = server.address().port;
  await new Promise((ok) => server.close(ok));
  return port;
}
async function others() {
  const ids = (await docker(["ps", "-aq"])).trim().split(/\s+/).filter(Boolean);
  if (!ids.length) return [];
  return JSON.parse(await docker(["inspect", ...ids]))
    .filter(
      (item) => item.Config.Labels?.["com.docker.compose.project"] !== project,
    )
    .map((item) => ({
      id: item.Id,
      started: item.State.StartedAt,
      restarts: item.RestartCount,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
const httpPort = await freePort(),
  httpsPort = await freePort();
const envFile = join(directory, "test.env"),
  override = join(directory, "override.json");
writeFileSync(
  envFile,
  `PULSO_DOMAIN=pulso.localhost\nPULSO_PUBLIC_URL=https://webhooks.localhost:${httpsPort}\nPULSO_WEBHOOK_DOMAIN=webhooks.localhost\nPULSO_BIND_IP=127.0.0.1\nPULSO_HTTP_PORT=${httpPort}\nPULSO_HTTPS_PORT=${httpsPort}\nPULSO_DB_USER=pulso\nPULSO_DB_NAME=pulso_webhook_test\nINSTAGRAM_EXECUTION_ACCOUNT_ID=123\nINSTAGRAM_SEND_MODE=live\nINSTAGRAM_META_VALIDATED=true\nINSTAGRAM_WEBHOOK_DIAGNOSTICS=true\nRESTIC_REPOSITORY=\n`,
);
// The logger cannot be enabled without a finite deadline (max. 24 hours).
writeFileSync(envFile, `INSTAGRAM_WEBHOOK_DIAGNOSTICS_UNTIL=${Date.now() + 7200000}\n`, { flag: "a" });
// Configuração externa tenta live; o overlay deve impor disabled independentemente dela.
const secrets = {};
for (const [name, value] of Object.entries({
  postgres_password: password,
  database_url: `postgresql://pulso:${password}@postgres:5432/pulso_webhook_test`,
  nextauth_secret: session,
  instagram_app_secret: appSecret,
  instagram_webhook_verify_token: verify,
})) {
  const file = join(directory, name);
  writeFileSync(file, value, { mode: 0o444 });
  secrets[name] = { file };
}
const candidateFile = join(directory, "diagnostic-candidate");
writeFileSync(candidateFile, candidate, { mode: 0o444 });
writeFileSync(override, JSON.stringify({ secrets, services: { web: { volumes: [
  { type: "bind", source: candidateFile, target: "/run/secrets/instagram_diagnostic_candidate", read_only: true },
] } } }));
const base = [
  "compose",
  "--project-directory",
  root,
  "--env-file",
  envFile,
  "-p",
  project,
  "-f",
  join(root, "compose.production.yaml"),
  "-f",
  join(root, "compose.webhook-reception.yaml"),
  "-f",
  override,
];
const compose = (...args) => docker([...base, ...args]);
const sql = (text) =>
  compose(
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "pulso",
    "-d",
    "pulso_webhook_test",
    "-At",
    "-c",
    text,
  );
async function inspect(service) {
  return JSON.parse(
    await docker([
      "inspect",
      (await compose("ps", "-a", "-q", service)).trim(),
    ]),
  )[0];
}
async function wait(check, name) {
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(1000);
  }
  throw Error(`TIMEOUT_${name}`);
}
const healthy = (name) =>
  wait(
    async () => (await inspect(name)).State.Health?.Status === "healthy",
    name,
  );
let ca,
  before,
  started = false;
async function probe(
  path,
  { host = "webhooks.localhost", method = "GET", body, signature, legacySignature } = {},
) {
  return new Promise((ok, fail) => {
    const headers = { Host: host };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(body);
    }
    if (signature) headers["X-Hub-Signature-256"] = signature;
    if (legacySignature) headers["X-Hub-Signature"] = legacySignature;
    const req = request(
      {
        hostname: "127.0.0.1",
        port: httpsPort,
        servername: "webhooks.localhost",
        path,
        method,
        headers,
        ca,
        rejectUnauthorized: true,
      },
      (res) => {
        let text = "";
        res.on("data", (part) => (text += part));
        res.on("end", () => ok({ status: res.statusCode, body: text }));
      },
    );
    req.setTimeout(10000, () => req.destroy(Error("PROBE_TIMEOUT")));
    req.on("error", fail);
    req.end(body);
  });
}
const setupArgs = (action) => [
  ...base,
  "run",
  "--rm",
  "-T",
  "tools",
  "node",
  "node_modules/tsx/dist/cli.mjs",
  "scripts/prepare-webhook-reception.ts",
  action,
];
try {
  before = await others();
  await compose("config", "--quiet");
  console.log("Recepção isolada: build de produção sem .env ou token real");
  await compose("build", "web", "migrate");
  started = true;
  await compose("up", "-d", "web", "caddy");
  for (const name of ["postgres", "web", "caddy"]) await healthy(name);
  const caFile = join(directory, "root.crt");
  await compose(
    "cp",
    "caddy:/data/caddy/pki/authorities/local/root.crt",
    caFile,
  );
  ca = readFileSync(caFile);
  const init = JSON.parse(
    (await docker(setupArgs("--initialize"))).trim().split("\n").at(-1),
  );
  assert.equal(init.initialized, true);
  assert.equal(init.ownerCreated, false);
  const repeated = JSON.parse(
    (await docker(setupArgs("--initialize"))).trim().split("\n").at(-1),
  );
  assert.equal(repeated.initialized, false);
  await docker(setupArgs("--check"));
  assert.equal((await sql('SELECT count(*) FROM "Workspace"')).trim(), "1");
  assert.equal(
    (
      await sql(
        "SELECT count(*) FROM \"SocialAccount\" WHERE status='NOT_CONNECTED'",
      )
    ).trim(),
    "1",
  );
  assert.equal(
    (
      await sql(
        'SELECT (SELECT count(*) FROM "User")+(SELECT count(*) FROM "InstagramReel")+(SELECT count(*) FROM "Automation")',
      )
    ).trim(),
    "0",
  );
  await sql(
    'INSERT INTO "Automation" (id,"workspaceId",name,"updatedAt") SELECT \'guard-fixture\',id,\'Preservar fixture\',now() FROM "Workspace"',
  );
  const refused = await docker(setupArgs("--initialize"), {
    allowFailure: true,
  });
  assert.notEqual(refused.code, 0);
  assert.match(refused.output, /EXISTING_DATA_REFUSED/);
  assert.equal((await sql('SELECT count(*) FROM "Automation"')).trim(), "1");
  await sql("DELETE FROM \"Automation\" WHERE id='guard-fixture'");

  const challenge = await probe(
    `/api/webhooks/instagram?hub.mode=subscribe&hub.challenge=12345&hub.verify_token=${encodeURIComponent(verify)}`,
  );
  assert.equal(challenge.status, 200);
  assert.equal(challenge.body, "12345");
  assert.equal(
    (
      await probe(
        "/api/webhooks/instagram?hub.mode=subscribe&hub.challenge=12345&hub.verify_token=wrong",
      )
    ).status,
    403,
  );
  for (const path of [
    "/",
    "/login",
    "/painel",
    "/atividades",
    "/api/atividades",
    "/api/auth/session",
    "/api/health/ready",
    "/_next/static/fixture.js",
    "/api/webhooks/instagram/extra",
  ])
    assert.equal((await probe(path)).status, 404, `Caminho exposto: ${path}`);
  assert.equal(
    (await probe("/api/webhooks/instagram", { host: "pulso.localhost" }))
      .status,
    404,
  );
  assert.equal(
    (await probe("/api/webhooks/instagram", { host: "127.0.0.1" })).status,
    404,
  );
  assert.equal(
    (await probe("/api/webhooks/instagram", { method: "PUT" })).status,
    404,
  );

  const body = JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: "123",
        time: Date.now(),
        changes: [
          {
            field: "comments",
            value: { id: "456", media: { id: "789" }, text: "fixture 🌊" },
          },
        ],
      },
    ],
  });
  const signature =
    "sha256=" + createHmac("sha256", appSecret).update(body).digest("hex");
  for (const extra of [{}, { legacySignature: "sha1=fixture-must-stay-private" }, { signature: "sha256=fixture-invalid-format" }])
    assert.equal((await probe("/api/webhooks/instagram", { method: "POST", body, ...extra })).status, 401);
  const originalBytes = '{\r\n "object": "instagram", "entry": [], "fixture": "ação 🌊" \r\n}\n';
  const originalSignature = "sha256=" + createHmac("sha256", appSecret).update(originalBytes).digest("hex");
  const changedSerializationSignature = "sha256=" + createHmac("sha256", appSecret).update(JSON.stringify(JSON.parse(originalBytes))).digest("hex");
  const candidateSignature = "sha256=" + createHmac("sha256", candidate).update(originalBytes).digest("hex");
  // Even a candidate match cannot authorize ingestion or return 200.
  assert.equal((await probe("/api/webhooks/instagram", { method: "POST", body: originalBytes, signature: candidateSignature })).status, 401);
  assert.equal((await probe("/api/webhooks/instagram", { method: "POST", body: originalBytes, signature: originalSignature })).status, 200);
  assert.equal((await probe("/api/webhooks/instagram", { method: "POST", body: originalBytes, signature: changedSerializationSignature })).status, 401);
  assert.equal(
    (
      await probe("/api/webhooks/instagram", {
        method: "POST",
        body,
        signature: "sha256" + "=" + "0".repeat(64),
      })
    ).status,
    401,
  );
  assert.equal(
    (await sql('SELECT count(*) FROM "InstagramWebhookEvent"')).trim(),
    "0",
  );
  assert.equal(
    (
      await probe("/api/webhooks/instagram", {
        method: "POST",
        body,
        signature,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await probe("/api/webhooks/instagram", {
        method: "POST",
        body,
        signature,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await probe("/api/webhooks/instagram", {
        method: "POST",
        body: body + " ",
        signature,
      })
    ).status,
    401,
  );
  assert.equal(
    (await sql('SELECT count(*) FROM "InstagramWebhookEvent"')).trim(),
    "1",
  );
  assert.equal(
    (
      await sql("SELECT count(*) FROM \"InstagramJob\" WHERE state='READY'")
    ).trim(),
    "1",
  );
  assert.equal(
    (await sql('SELECT count(*) FROM "InstagramOutbound"')).trim(),
    "0",
  );
  assert.equal((await compose("ps", "-a", "-q", "worker")).trim(), "");
  const web = await inspect("web"),
    caddy = await inspect("caddy");
  assert.ok(web.Config.Env.includes("INSTAGRAM_SEND_MODE=disabled"));
  assert.ok(web.Config.Env.includes("INSTAGRAM_META_VALIDATED=false"));
  assert.equal(
    web.Mounts.some(
      (item) => item.Destination === "/run/secrets/instagram_token",
    ),
    false,
  );
  for (const name of Object.keys(web.NetworkSettings.Networks))
    assert.equal(
      JSON.parse(await docker(["network", "inspect", name]))[0].Internal,
      true,
    );
  for (const name of ["web", "postgres"])
    assert.equal(
      Object.keys((await inspect(name)).HostConfig.PortBindings ?? {}).length,
      0,
    );
  for (const bindings of Object.values(caddy.HostConfig.PortBindings))
    for (const binding of bindings) assert.equal(binding.HostIp, "127.0.0.1");
  await compose("restart", "postgres");
  await healthy("postgres");
  assert.equal(
    (await sql('SELECT count(*) FROM "InstagramWebhookEvent"')).trim(),
    "1",
  );
  assert.equal(
    (
      await sql("SELECT count(*) FROM \"InstagramJob\" WHERE state='READY'")
    ).trim(),
    "1",
  );
  const logs = await compose("logs", "--no-color");
  for (const value of [...privateValues, signature, originalSignature, changedSerializationSignature, candidateSignature, "sha1=fixture-must-stay-private", "sha256=fixture-invalid-format", "ação 🌊"])
    assert.equal(logs.includes(value), false, "Credencial de fixture nos logs");
  const diagnostics = logs.split(/\r?\n/).filter((line) => line.includes('"event":"PULSO_WEBHOOK_SIGNATURE_DIAGNOSTIC"'))
    .map((line) => JSON.parse(line.slice(line.indexOf('{"event":'))));
  for (const outcome of ["MISSING_SIGNATURE", "INVALID_SIGNATURE_FORMAT", "HMAC_MISMATCH", "VALID_SIGNATURE"])
    assert.ok(diagnostics.some((record) => record.result === outcome), `Diagnóstico ausente: ${outcome}`);
  assert.ok(diagnostics.some((record) => record.legacySignaturePresent && !record.signature256Present));
  assert.ok(diagnostics.some((record) => record.result === "HMAC_MISMATCH" && record.candidateHmacMatches === true));
  assert.ok(diagnostics.some((record) => record.result === "VALID_SIGNATURE" && record.candidateHmacMatches === false));
  for (const record of diagnostics)
    assert.deepEqual(Object.keys(record).sort(), ["event", "at", "signature256Present", "signature256FormatValid", "legacySignaturePresent", "rawBodyRead", "candidateHmacMatches", "result"].sort());
  console.log(
    "Recepção isolada passou: HTTPS verificado, desafio/HMAC, adulteração rejeitada, evento/fila duráveis sem duplicatas, painel/IP/portas bloqueados, sem worker, token ou saída de rede do web.",
  );
} catch (error) {
  console.error(redact(error.message));
  process.exitCode = 1;
} finally {
  assert.match(project, /^pulso-webhook-reception-[a-f0-9]{10}$/);
  if (started) await compose("down", "--volumes", "--remove-orphans");
  if (before)
    assert.deepEqual(await others(), before, "Outro projeto foi alterado");
  assert.match(
    relative(resolve(tmpdir()), resolve(directory)),
    /^pulso-webhook-reception-[^/\\]+$/,
  );
  rmSync(directory, { recursive: true, force: true });
}
