// Testa SOMENTE a topologia nova; não lê .env ou dumps reais, não conecta à Meta/Cloudflare.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep, basename } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { buildTunnelConfiguration } from "../../ops/cloudflare/config.mjs";
const root = resolve("."), directory = mkdtempSync(join(tmpdir(), "pulso-private-test-"));
const project = `pulso-private-test-${randomBytes(5).toString("hex")}`;
const password = randomBytes(32).toString("hex"), session = randomBytes(32).toString("hex");
const redacted = text => [password, session].reduce((value, secret) => value.replaceAll(secret, "[redacted]"), text);
async function docker(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", data => { output += data; }); child.stderr.on("data", data => { output += data; });
    child.on("error", reject); child.on("exit", code => code === 0 ? resolve(output) : reject(new Error(redacted(output))));
  });
}
const env = join(directory, "test.env");
writeFileSync(env, `PULSO_DOMAIN=pulso.example.com\nPULSO_PUBLIC_URL=https://pulso.example.com\nPULSO_DB_NAME=pulso_private_test\nPULSO_DB_USER=pulso\nPULSO_IMAGE=pulso:production\nPULSO_TOOLS_IMAGE=pulso:tools\nPULSO_BACKUP_IMAGE=pulso:backup\nRESTIC_REPOSITORY=\n`);
const secrets = {};
for (const [name, value] of Object.entries({ postgres_password: password, database_url: `postgresql://pulso:${password}@postgres:5432/pulso_private_test`, nextauth_secret: session, instagram_token: "", instagram_app_secret:"",instagram_webhook_verify_token:"",restic_password: "", s3_access_key: "", s3_secret_key: "", tunnel_credentials: "" })) {
  const path = join(directory, name); writeFileSync(path, value, { mode: 0o444 }); secrets[name] = { file: path };
}
const tunnelConfig = join(directory, "tunnel-config.json");
writeFileSync(tunnelConfig, JSON.stringify(buildTunnelConfiguration({ hostname: "pulso.example.com", teamName: "test-team", tunnelId: randomUUID(), audience: "a".repeat(64) })), { mode: 0o444 });
const overrides = join(directory, "override.json");
writeFileSync(overrides, JSON.stringify({ secrets, configs: { tunnel_config: { file: tunnelConfig } } }));
const base = ["compose", "--project-directory", root, "--env-file", env, "-p", project, "-f", join(root, "compose.production.yaml"), "-f", join(root, "compose.private.yaml"), "-f", overrides];
const compose = (...args) => docker([...base, ...args]);
async function inspect(service) { const id = (await compose("ps", "-a", "-q", service)).trim(); return JSON.parse(await docker(["inspect", id]))[0]; }
async function healthy(service) {
  const until = Date.now() + 120000;
  while (Date.now() < until) { if ((await inspect(service)).State.Health?.Status === "healthy") return; await delay(1000); }
  throw new Error(`Saúde indisponível: ${service}`);
}
async function existingContainers() {
  const ids = (await docker(["ps", "-aq"])).trim().split(/\s+/).filter(Boolean);
  if (!ids.length) return [];
  return JSON.parse(await docker(["inspect", ...ids])).filter(item => item.Config.Labels?.["com.docker.compose.project"] !== project).map(item => ({ id: item.Id, started: item.State.StartedAt, restarts: item.RestartCount })).sort((a,b) => a.id.localeCompare(b.id));
}
const before = await existingContainers();
try {
  const config = JSON.parse(await compose("--profile", "tunnel", "config", "--format", "json"));
  for (const service of Object.values(config.services)) assert.equal(service.ports?.length ?? 0, 0);
  assert.deepEqual(Object.keys(config.services.cloudflared.networks), ["edge"]);
  assert.equal(config.services.cloudflared.configs[0].target, "/etc/cloudflared/config.json");
  assert.ok(config.services.cloudflared.profiles.includes("tunnel"));
  await docker(["run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--mount", `type=bind,src=${tunnelConfig},dst=/etc/cloudflared/config.json,readonly`, "cloudflare/cloudflared:2026.10.0", "tunnel", "--config", "/etc/cloudflared/config.json", "ingress", "validate"]);
  for (const [url, index] of [["https://pulso.example.com/login", 1], ["https://pulso.example.com/api/webhooks/meta", 0], ["https://other.example.com/", 2]]) {
    const rule = await docker(["run", "--rm", "--network", "none", "--mount", `type=bind,src=${tunnelConfig},dst=/etc/cloudflared/config.json,readonly`, "cloudflare/cloudflared:2026.10.0", "tunnel", "--config", "/etc/cloudflared/config.json", "ingress", "rule", url]);
    assert.match(rule, new RegExp(`Matched rule #${index}`));
  }
  await compose("up", "-d", "postgres"); await healthy("postgres");
  await compose("up", "-d", "web", "worker", "caddy");
  for (const service of ["web", "worker", "caddy"]) await healthy(service);
  assert.equal((await compose("ps", "-a", "-q", "cloudflared")).trim(), "");
  for (const service of ["postgres", "web", "worker", "caddy"]) assert.equal(Object.keys((await inspect(service)).HostConfig.PortBindings ?? {}).length, 0);
  const probe = async (path, host="pulso.example.com") => {
    const script = `const http=require('node:http');const req=http.request({hostname:'caddy',port:8080,path:${JSON.stringify(path)},headers:{Host:${JSON.stringify(host)}}},r=>{let body='';r.on('data',v=>body+=v);r.on('end',()=>console.log(JSON.stringify({status:r.statusCode,body})));});req.setTimeout(10000,()=>req.destroy());req.on('error',()=>process.exit(1));req.end();`;
    return JSON.parse(await compose("exec", "-T", "web", "node", "-e", script));
  };
  const login = await probe("/login"); assert.equal(login.status, 200); assert.match(login.body, /Pulso/);
  assert.equal((await probe("/api/automacoes")).status, 401);
  for (const path of ["/api/health/ready", "/api/webhooks", "/api/webhooks/meta", "/webhooks/meta"]) assert.equal((await probe(path)).status, 404);
  assert.equal((await probe("/login", "other.example.com")).status, 404);
  const caddy = await inspect("caddy"), web = await inspect("web");
  assert.equal(web.Config.User, "pulso"); assert.equal(web.HostConfig.ReadonlyRootfs, true);
  const edge = Object.keys(caddy.NetworkSettings.Networks).find(name => name.endsWith("_edge"));
  assert.equal(Object.hasOwn((await inspect("postgres")).NetworkSettings.Networks, edge), false);
  assert.equal(Object.hasOwn((await inspect("worker")).NetworkSettings.Networks, edge), false);
  console.log("Topologia privada passou: zero portas publicadas, login preservado, API protegida, saúde/webhooks bloqueados, redes separadas e conector desligado.");
} finally {
  assert.ok(project.startsWith("pulso-private-test-"));
  await compose("down", "-v", "--remove-orphans");
  assert.deepEqual(await existingContainers(), before, "Um container de outro projeto mudou durante o teste");
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep) && basename(directory).startsWith("pulso-private-test-"));
  rmSync(directory, { recursive: true, force: true });
}
