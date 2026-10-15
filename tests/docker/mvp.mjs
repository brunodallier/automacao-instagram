// Somente fixtures e volumes descartáveis; não lê .env, não usa token real nem publica na internet.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { randomBytes, createHmac } from "node:crypto";
import { request } from "node:https";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { encode } from "next-auth/jwt";
import { prepareAccess } from "../../ops/mvp/prepare-access.mjs";

const root = resolve("."),
  directory = mkdtempSync(join(tmpdir(), "pulso-mvp-test-"));
const withWebhooks = process.argv.includes("--webhooks"),
  appSecret = randomBytes(32).toString("hex"),
  verifyToken = randomBytes(32).toString("hex");
const project = `pulso-mvp-test-${randomBytes(5).toString("hex")}`;
const password = randomBytes(32).toString("hex"),
  session = randomBytes(32).toString("hex");
const fixturePassword = "Aa1!" + randomBytes(4).toString("hex");
const sensitive = [password, session, fixturePassword, appSecret, verifyToken];
const redact = (text) =>
  sensitive.reduce(
    (value, secret) => value.replaceAll(secret, "[redacted]"),
    text,
  );
async function docker(args, stdin = "") {
  return new Promise((ok, fail) => {
    const child = spawn("docker", args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (data) => {
      output += data;
    });
    child.stderr.on("data", (data) => {
      output += data;
    });
    child.on("error", fail);
    child.on("exit", (code) =>
      code === 0 ? ok(output) : fail(new Error(redact(output))),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
  });
}
async function freePort() {
  const server = createServer();
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const port = server.address().port;
  await new Promise((ok) => server.close(ok));
  return port;
}
const httpsPort = await freePort(),
  httpPort = await freePort(),
  origin = `https://localhost:${httpsPort}`;
const env = join(directory, "test.env"),
  overrides = join(directory, "override.json");
writeFileSync(
  env,
  `PULSO_DOMAIN=localhost\nPULSO_PUBLIC_URL=${origin}\nPULSO_BIND_IP=127.0.0.1\nPULSO_HTTP_PORT=${httpPort}\nPULSO_HTTPS_PORT=${httpsPort}\nPULSO_DB_NAME=pulso_mvp_test\nPULSO_DB_USER=pulso\nRESTIC_REPOSITORY=\nINSTAGRAM_SEND_MODE=disabled\nINSTAGRAM_WEBHOOK_ENABLED=${withWebhooks}\nINSTAGRAM_EXECUTION_ACCOUNT_ID=123\nPULSO_WEBHOOK_DOMAIN=webhooks.localhost\n`,
);
const secrets = {};
for (const [name, value] of Object.entries({
  postgres_password: password,
  database_url: `postgresql://pulso:${password}@postgres:5432/pulso_mvp_test`,
  nextauth_secret: session,
  instagram_token: "",
  instagram_app_secret: withWebhooks ? appSecret : "",
  instagram_webhook_verify_token: withWebhooks ? verifyToken : "",
  restic_password: "",
  s3_access_key: "",
  s3_secret_key: "",
})) {
  const file = join(directory, name);
  writeFileSync(file, value, { mode: 0o444 });
  secrets[name] = { file };
}
const base = [
  "compose",
  "--project-directory",
  root,
  "--env-file",
  env,
  "-p",
  project,
  "-f",
  join(root, "compose.production.yaml"),
  "-f",
  join(root, "compose.mvp.yaml"),
  "-f",
  overrides,
];
if (withWebhooks) base.push("-f", join(root, "compose.webhooks.yaml"));
const compose = (...args) => docker([...base, ...args]);
async function inspect(service) {
  return JSON.parse(
    await docker([
      "inspect",
      (await compose("ps", "-a", "-q", service)).trim(),
    ]),
  )[0];
}
async function healthy(service) {
  const until = Date.now() + 150000;
  while (Date.now() < until) {
    if ((await inspect(service)).State.Health?.Status === "healthy") return;
    await delay(1500);
  }
  throw new Error(`Serviço indisponível: ${service}`);
}
const sql = (statement) =>
  compose(
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "pulso",
    "-d",
    "pulso_mvp_test",
    "-At",
    "-c",
    statement,
  );
async function otherContainers() {
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
const before = await otherContainers();
let ca, authorization;
async function http(
  path,
  {
    gate = true,
    token,
    method = "GET",
    body,
    form,
    extra = {},
    host,
    webhookHost = false,
  } = {},
) {
  const headers = { ...extra };
  if (gate) headers.Authorization = authorization;
  if (token) headers.Cookie = `__Secure-next-auth.session-token=${token}`;
  if (host) headers.Host = host;
  const payload = form
    ? new URLSearchParams(form).toString()
    : body === undefined
      ? undefined
      : JSON.stringify(body);
  if (payload !== undefined) {
    headers["Content-Type"] = form
      ? "application/x-www-form-urlencoded"
      : "application/json";
    headers.Origin ??= origin;
  }
  return new Promise((ok, fail) => {
    const url = webhookHost
      ? `https://webhooks.localhost:${httpsPort}${path}`
      : `${origin}${path}`;
    const req = request(
      url,
      {
        method,
        headers,
        ca,
        servername: webhookHost ? "webhooks.localhost" : "localhost",
        rejectUnauthorized: true,
        ...(webhookHost
          ? {
              lookup: (_hostname, _options, callback) =>
                callback(null, [{ address: "127.0.0.1", family: 4 }]),
            }
          : {}),
      },
      (res) => {
        let body = "";
        res.on("data", (data) => {
          body += data;
        });
        res.on("end", () =>
          ok({ status: res.statusCode, body, headers: res.headers }),
        );
      },
    );
    req.on("error", fail);
    req.setTimeout(15000, () => req.destroy(new Error("HTTPS timeout")));
    req.end(payload);
  });
}
async function plainHttp(host) {
  return new Promise((ok, fail) => {
    const req = httpRequest(
      `http://127.0.0.1:${httpPort}/login`,
      { headers: { Host: host } },
      (res) => {
        let body = "";
        res.on("data", (data) => {
          body += data;
        });
        res.on("end", () =>
          ok({ status: res.statusCode, headers: res.headers, body }),
        );
      },
    );
    req.on("error", fail);
    req.setTimeout(10000, () => req.destroy());
    req.end();
  });
}
try {
  const gate = await prepareAccess(join(directory, "gate"));
  const credentials = JSON.parse(readFileSync(gate.credentialFile, "utf8"));
  sensitive.push(credentials.password);
  authorization =
    "Basic " +
    Buffer.from(`${credentials.username}:${credentials.password}`).toString(
      "base64",
    );
  sensitive.push(authorization, authorization.slice(6));
  secrets.panel_users = { file: gate.hashFile };
  await assert.rejects(
    () => prepareAccess(join(directory, "gate")),
    /existente/,
  );
  await assert.rejects(
    () => prepareAccess(join(root, "deploy", "secrets")),
    /fora do repositório/,
  );
  writeFileSync(overrides, JSON.stringify({ secrets }));
  const config = JSON.parse(await compose("config", "--format", "json"));
  assert.equal(config.networks.application.internal, true);
  assert.deepEqual(Object.keys(config.services.caddy.networks), ["edge"]);
  for (const [name, service] of Object.entries(config.services))
    if (name !== "caddy") assert.equal(service.ports?.length ?? 0, 0);
  assert.deepEqual(
    config.services.caddy.ports
      .map((port) => port.target)
      .toSorted((a, b) => a - b),
    [80, 443],
  );
  assert.ok(
    config.services.caddy.ports.every((port) => port.host_ip === "127.0.0.1"),
  );
  // Sem arquivo obrigatório, a configuração falha; não inicia um painel desprotegido.
  await assert.rejects(
    () =>
      docker([
        "run",
        "--rm",
        "--network",
        "none",
        "-e",
        "PULSO_DOMAIN=localhost",
        "--mount",
        `type=bind,src=${join(root, "ops", "Caddyfile.mvp")},dst=/etc/caddy/Caddyfile,readonly`,
        "caddy:2.11.2-alpine",
        "caddy",
        "validate",
        "--config",
        "/etc/caddy/Caddyfile",
      ]),
    /no files matching|does not exist|not found/,
  );
  await compose("up", "-d", "postgres");
  await healthy("postgres");
  await compose("up", "-d", "web", "worker", "caddy");
  for (const service of ["web", "worker", "caddy"]) await healthy(service);
  assert.equal((await sql("SHOW server_encoding")).trim(), "UTF8");
  assert.equal(
    (
      await sql(
        'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
      )
    ).trim(),
    "7",
  );
  await docker(
    [
      ...base,
      "run",
      "--rm",
      "-T",
      "tools",
      "node",
      "node_modules/tsx/dist/cli.mjs",
      "-e",
      "import {readFileSync} from 'node:fs'; import {createDatabaseClient} from './src/lib/db.ts'; import {configureFirstOwner} from './src/lib/bootstrap-owner.ts'; const db=createDatabaseClient(process.env.DATABASE_URL!); (async()=>{await configureFirstOwner(db,JSON.parse(readFileSync(0,'utf8')));await db.$disconnect()})()",
    ],
    JSON.stringify({
      name: "Teste MVP",
      email: "mvp@example.invalid",
      password: fixturePassword,
      workspaceName: "Teste MVP",
    }),
  );
  const certificate = join(directory, "root.crt");
  await compose(
    "cp",
    "caddy:/data/caddy/pki/authorities/local/root.crt",
    certificate,
  );
  ca = readFileSync(certificate);
  const noGate = await http("/login", { gate: false });
  assert.equal(noGate.status, 401);
  assert.match(noGate.headers["www-authenticate"], /Basic/);
  assert.doesNotMatch(noGate.body, /<title>Pulso/);
  assert.equal(
    (
      await http("/login", {
        gate: false,
        extra: {
          Authorization:
            "Basic " + Buffer.from("pulso:wrong").toString("base64"),
        },
      })
    ).status,
    401,
  );
  const login = await http("/login");
  assert.equal(login.status, 200);
  assert.match(login.body, /Pulso/);
  const redirect = await plainHttp("localhost");
  assert.equal(redirect.status, 308);
  assert.match(redirect.headers.location, /^https:\/\/localhost/);
  assert.doesNotMatch(redirect.body, /<title>Pulso/);
  assert.equal((await plainHttp("179.236.76.212")).status, 404);
  assert.equal(login.headers["strict-transport-security"], "max-age=15552000");
  const csrf = await http("/api/auth/csrf");
  assert.equal(csrf.status, 200);
  const csrfToken = JSON.parse(csrf.body).csrfToken;
  sensitive.push(csrfToken);
  const csrfCookie = csrf.headers["set-cookie"]
    .map((value) => value.split(";")[0])
    .join("; ");
  sensitive.push(csrfCookie);
  const signedIn = await http("/api/auth/callback/credentials", {
    method: "POST",
    extra: { Cookie: csrfCookie },
    form: {
      csrfToken,
      email: "mvp@example.invalid",
      password: fixturePassword,
      callbackUrl: origin + "/painel",
      json: "true",
    },
  });
  assert.equal(signedIn.status, 200);
  assert.equal(JSON.parse(signedIn.body).url, origin + "/painel");
  const ownerCookie = signedIn.headers["set-cookie"]
    .map((value) => value.split(";")[0])
    .join("; ");
  sensitive.push(ownerCookie);
  assert.equal(
    (await http("/api/automacoes", { extra: { Cookie: ownerCookie } })).status,
    200,
  );
  const assets = [
    ...new Set(
      [
        ...login.body.matchAll(
          /(?:src|href)="([^"\s]*\/_next\/static\/[^"\s]+\.(?:css|js))"/g,
        ),
      ].map((match) => match[1]),
    ),
  ];
  assert.ok(assets.length);
  // Várias requisições simultâneas cobrem o consumo de memória do Argon2id.
  await Promise.all(
    assets.map(async (asset) => assert.equal((await http(asset)).status, 200)),
  );
  assert.equal((await http(assets[0], { gate: false })).status, 401);
  assert.equal((await http("/api/automacoes")).status, 401);
  const owner = JSON.parse(
    (
      await sql(
        "SELECT json_build_object('id',id,'version',\"sessionVersion\") FROM \"User\" LIMIT 1",
      )
    ).trim(),
  );
  const token = await encode({
    secret: session,
    maxAge: 3600,
    token: {
      sub: owner.id,
      sessionVersion: owner.version,
      authenticatedAt: Date.now(),
    },
  });
  sensitive.push(token);
  assert.equal((await http("/api/automacoes", { token })).status, 200);
  assert.equal(
    (await http("/api/automacoes", { token, gate: false })).status,
    401,
  );
  assert.equal(
    (
      await http("/api/automacoes", {
        gate: false,
        extra: {
          "Cf-Access-Jwt-Assertion": "fake",
          "Cf-Access-Authenticated-User-Email": "mvp@example.invalid",
        },
      })
    ).status,
    401,
  );
  for (const path of [
    "/api/health",
    "/api/health/ready",
    "/api/webhooks",
    "/api/webhooks/meta",
    "/webhooks/meta",
    "/api/%77ebhooks/meta",
  ]) {
    assert.equal((await http(path)).status, 404);
    assert.equal((await http(path, { gate: false })).status, 404);
  }
  const unknown = await http("/login", { host: "other.example.invalid" });
  assert.ok([404, 421].includes(unknown.status));
  const draft = {
    name: "Teste MVP 🌊",
    scope: "GLOBAL",
    reelIds: [],
    keywords: ["teste"],
    steps: [
      {
        kind: "SEND_DM",
        format: "TEXT",
        text: "Mensagem 🌊 漢字",
        buttons: [],
      },
    ],
    publicReplies: {
      enabled: false,
      strategy: "ROTATING",
      variations: ["", "", "", "", ""],
      fallback: { enabled: false, text: "" },
    },
  };
  assert.equal(
    (
      await http("/api/automacoes", {
        token,
        method: "POST",
        body: draft,
        extra: { Origin: "https://other.example.invalid" },
      })
    ).status,
    403,
  );
  const created = await http("/api/automacoes", {
    token,
    method: "POST",
    body: draft,
  });
  assert.equal(created.status, 201);
  const saved = JSON.parse(created.body);
  assert.equal(saved.status, "DRAFT");
  assert.equal(
    JSON.parse((await http(`/api/automacoes/${saved.id}`, { token })).body)
      .steps[0].text,
    "Mensagem 🌊 漢字",
  );
  const activate = await http(`/api/automacoes/${saved.id}/ativar`, {
    token,
    method: "POST",
    body: {},
  });
  assert.equal(activate.status, 409);
  assert.match(activate.body, /integração com o Instagram/);
  await compose("restart", "postgres");
  await healthy("postgres");
  await healthy("web");
  assert.equal(
    JSON.parse((await http(`/api/automacoes/${saved.id}`, { token })).body)
      .steps[0].text,
    "Mensagem 🌊 漢字",
  );
  for (const service of ["postgres", "web", "worker"])
    assert.equal(
      Object.keys((await inspect(service)).HostConfig.PortBindings ?? {})
        .length,
      0,
    );
  const caddy = await inspect("caddy"),
    web = await inspect("web"),
    worker = await inspect("worker");
  assert.equal(Object.keys(caddy.NetworkSettings.Networks).length, 1);
  const edge = Object.keys(caddy.NetworkSettings.Networks)[0];
  assert.equal(
    Object.hasOwn((await inspect("postgres")).NetworkSettings.Networks, edge),
    false,
  );
  assert.equal(Object.hasOwn(worker.NetworkSettings.Networks, edge), false);
  assert.equal(web.Config.User, "pulso");
  assert.equal(web.HostConfig.ReadonlyRootfs, true);
  assert.equal(worker.HostConfig.RestartPolicy.Name, "unless-stopped");
  assert.equal(
    worker.Mounts.some((m) => m.Destination.includes("app_secret")),
    false,
  );
  const health = JSON.parse(
    await compose(
      "exec",
      "-T",
      "worker",
      "node",
      "-e",
      "console.log(require('fs').readFileSync('/tmp/pulso-worker-health.json','utf8'))",
    ),
  );
  assert.equal(health.executionEnabled, false);
  const logs = await compose("logs", "--no-color");
  for (const secret of sensitive)
    assert.equal(logs.includes(secret), false, "Credencial nos logs");
  if (withWebhooks) {
    const challenge = await http(
      `/api/webhooks/instagram?hub.mode=subscribe&hub.challenge=12345&hub.verify_token=${verifyToken}`,
      { gate: false, webhookHost: true },
    );
    assert.equal(challenge.status, 200);
    assert.equal(challenge.body, "12345");
    assert.equal(
      (await http("/login", { gate: false, webhookHost: true })).status,
      404,
    );
    assert.equal(
      (await http("/api/automacoes", { gate: false, webhookHost: true }))
        .status,
      404,
    );
    const body = { object: "instagram", entry: [] },
      signature =
        "sha256=" +
        createHmac("sha256", appSecret)
          .update(JSON.stringify(body))
          .digest("hex");
    assert.equal(
      (
        await http("/api/webhooks/instagram", {
          gate: false,
          webhookHost: true,
          method: "POST",
          body,
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await http("/api/webhooks/instagram", {
          gate: false,
          webhookHost: true,
          method: "POST",
          body,
          extra: { "X-Hub-Signature-256": signature },
        })
      ).status,
      200,
    );
    const latest = await compose("logs", "--no-color");
    for (const secret of sensitive)
      assert.equal(
        latest.includes(secret),
        false,
        "Credencial no log do webhook",
      );
    console.log(
      "Hostname de webhook isolado passou: certificado válido, desafio/HMAC, sem login humano e sem bypass do painel.",
    );
  }
  console.log(
    "MVP Docker passou: HTTPS verificado, Argon2id, duas autenticações, assets, CSRF, webhook fechado, redes/portas isoladas, UTF8, rascunhos, persistência e ativação real bloqueada.",
  );
} catch (error) {
  console.error(redact(error.message));
  process.exitCode = 1;
} finally {
  assert.match(project, /^pulso-mvp-test-[a-f0-9]{10}$/);
  if (Object.hasOwn(secrets, "panel_users"))
    await compose("down", "-v", "--remove-orphans");
  const after = await otherContainers();
  for (const item of before)
    assert.deepEqual(
      after.find((value) => value.id === item.id),
      item,
      "Container preexistente foi alterado",
    );
  assert.match(
    relative(resolve(tmpdir()), resolve(directory)),
    /^pulso-mvp-test-[^/\\]+$/,
  );
  rmSync(directory, { recursive: true, force: true });
}
