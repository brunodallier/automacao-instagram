// Ambiente descartável: nunca carrega .env nem acessa o banco do localhost.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { request } from "node:https";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { encode } from "next-auth/jwt";

const args = process.argv.slice(2);
const option = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const wsl = option("--wsl");
const dump = option("--dump"); // dump privado opcional; não copia credenciais de .env
const root = resolve(".");
const directory = mkdtempSync(join(tmpdir(), "pulso-docker-test-"));
const project = `pulso-test-${randomBytes(5).toString("hex")}`;
const linuxPath = (path) => wsl ? path.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`).replaceAll("\\", "/") : path;
const password = randomBytes(32).toString("hex");
const auth = randomBytes(32).toString("hex");
const restic = randomBytes(32).toString("hex");
const sensitive = [password, auth, restic];
const safe = (value) => sensitive.reduce((text, value) => text.replaceAll(value, "[redacted]"), value);
async function run(args, { stdin = "" } = {}) {
  const command = wsl ? "wsl.exe" : "docker";
  const prefix = wsl ? ["-d", wsl, "-u", "root", "--exec", "/usr/bin/docker", "--config", "/tmp/pulso-docker-cli", "-H", "unix:///var/run/docker.sock"] : [];
  return await new Promise((ok, fail) => {
    const child = spawn(command, [...prefix, ...args], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { output += data; });
    child.on("error", fail);
    child.on("exit", (code) => code === 0 ? ok(output) : fail(new Error(safe(output))));
    child.stdin.end(stdin);
  });
}
async function port() {
  const server = createServer();
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const value = server.address().port;
  await new Promise((ok) => server.close(ok));
  return value;
}
const httpsPort = await port();
const httpPort = await port();
const origin = `https://localhost:${httpsPort}`;
const envFile = join(directory, "test.env");
writeFileSync(envFile, `PULSO_DOMAIN=localhost\nPULSO_PUBLIC_URL=${origin}\nPULSO_BIND_IP=127.0.0.1\nPULSO_HTTP_PORT=${httpPort}\nPULSO_HTTPS_PORT=${httpsPort}\nPULSO_DB_USER=pulso\nPULSO_DB_NAME=pulso_test\nRESTIC_REPOSITORY=/repository\n`, { mode: 0o600 });
const values = { postgres_password: password, database_url: `postgresql://pulso:${password}@postgres:5432/pulso_test`, nextauth_secret: auth, instagram_token: "", restic_password: restic, s3_access_key: "", s3_secret_key: "" };
const secrets = {};
for (const [name, value] of Object.entries(values)) {
  const file = join(directory, name);
  // Compose local monta arquivos do host; usuário do container precisa ler.
  // O diretório temporário continua privado (0700 em Linux, ACL do usuário em Windows).
  writeFileSync(file, value, { mode: 0o444 });
  secrets[name] = { file: linuxPath(file) };
}
const overrideFile = join(directory, "override.json");
writeFileSync(overrideFile, JSON.stringify({ services: { backup: { volumes: ["test_repository:/repository"] } }, volumes: { test_repository: {} }, secrets }));
const base = ["compose", "--project-directory", linuxPath(root), "--env-file", linuxPath(envFile), "-p", project, "-f", linuxPath(join(root, "compose.production.yaml")), "-f", linuxPath(overrideFile)];
const compose = (...args) => run([...base, ...args]);
const sql = (statement, database = "pulso_test") => compose("exec", "-T", "postgres", "psql", "-U", "pulso", "-d", database, "-At", "-c", statement);
const container = async (service) => (await compose("ps", "-a", "-q", service)).trim();
async function inspect(service) { return JSON.parse(await run(["inspect", await container(service)]))[0]; }
async function wait(check, name, timeout = 180000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await check()) return; await delay(2000); }
  throw new Error(`Timeout: ${name}`);
}
async function healthy(service) { await wait(async () => (await inspect(service)).State.Health?.Status === "healthy", service); }
let ca;
async function http(path, { method = "GET", token, body } = {}) {
  return await new Promise((ok, fail) => {
    const headers = {};
    const payload = body === undefined ? undefined : JSON.stringify(body);
    if (token) headers.Cookie = `__Secure-next-auth.session-token=${token}`;
    if (payload !== undefined) { headers["Content-Type"] = "application/json"; headers["Content-Length"] = Buffer.byteLength(payload); headers.Origin = origin; }
    const req = request(`${origin}${path}`, { ca, method, headers, rejectUnauthorized: true }, (res) => {
      let text = ""; res.on("data", (data) => { text += data; });
      res.on("end", () => ok({ status: res.statusCode, body: text, headers: res.headers }));
    });
    req.on("error", fail); req.setTimeout(15000, () => req.destroy(new Error("HTTPS timeout"))); req.end(payload);
  });
}
async function fingerprint(database = "pulso_test") {
  const tables = (await sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename", database)).trim().split("\n");
  const result = {};
  for (const table of tables) {
    const name = '"' + table.replaceAll('"', '""') + '"';
    result[table] = (await sql(`SELECT count(*) || ':' || coalesce(md5(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text)), md5('')) FROM ${name} t`, database)).trim();
  }
  return result;
}
let restoredContainer;
try {
  console.log("Docker: configuração e imagens de produção");
  await compose("config", "--quiet");
  await compose("build", "web", "migrate", "backup");
  await compose("up", "-d", "postgres");
  await healthy("postgres");
  assert.equal((await sql("SHOW server_encoding")).trim(), "UTF8");
  if (dump) {
    await compose("cp", linuxPath(resolve(dump)), "postgres:/tmp/source.dump");
    await compose("exec", "-T", "postgres", "pg_restore", "-U", "pulso", "-d", "pulso_test", "--no-owner", "--no-acl", "--exit-on-error", "--single-transaction", "/tmp/source.dump");
  }
  await compose("up", "-d", "web", "worker", "caddy");
  for (const service of ["web", "worker", "caddy"]) await healthy(service);
  const original = await fingerprint();
  assert.equal((await sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).trim(), "6");
  if (!dump) {
    // Fixtures somente no banco descartável, criadas pelo comando oficial do projeto.
    await compose("run", "--rm", "tools", "node", "node_modules/tsx/dist/cli.mjs", "-e", "import { randomBytes } from 'node:crypto'; import { createDatabaseClient } from './src/lib/db.ts'; import { configureFirstOwner } from './src/lib/bootstrap-owner.ts'; const db=createDatabaseClient(process.env.DATABASE_URL!); (async()=>{await configureFirstOwner(db,{name:'Teste Docker',email:'docker@example.invalid',password:'Aa1!'+randomBytes(4).toString('hex'),workspaceName:'Teste Docker'});await db.$disconnect()})()");
  }
  const certificate = join(directory, "root.crt");
  await compose("cp", "caddy:/data/caddy/pki/authorities/local/root.crt", linuxPath(certificate));
  ca = readFileSync(certificate);
  const login = await http("/login");
  assert.equal(login.status, 200);
  const assets = [...new Set([...login.body.matchAll(/(?:src|href)="([^"\s]*\/_next\/static\/[^"\s]+\.(?:css|js))"/g)].map((match) => match[1]))];
  assert.ok(assets.length > 0, "o build deve servir assets da interface");
  for (const asset of assets) assert.equal((await http(asset)).status, 200);
  assert.equal((await http("/api/health/ready")).status, 404);
  assert.equal((await http("/api/automacoes")).status, 401);
  const owner = JSON.parse((await sql('SELECT json_build_object(\'id\',u.id,\'version\',u."sessionVersion",\'workspace\',m."workspaceId") FROM "User" u JOIN "WorkspaceMembership" m ON m."userId"=u.id WHERE m.role=\'OWNER\' ORDER BY u."createdAt",m."createdAt" LIMIT 1')).trim());
  const token = await encode({ secret: auth, maxAge: 3600, token: { sub: owner.id, sessionVersion: owner.version, authenticatedAt: Date.now() } });
  sensitive.push(token);
  assert.equal((await http("/api/automacoes", { token })).status, 200);
  const reels = await http("/api/instagram/reels", { token });
  assert.equal(reels.status, 200);
  const library = JSON.parse(reels.body);
  const expectedReels = JSON.parse((await sql(`SELECT coalesce(json_agg(r.id ORDER BY r.id), '[]'::json) FROM "InstagramReel" r JOIN "SocialAccount" a ON a.id=r."socialAccountId" WHERE a."workspaceId"='${owner.workspace.replaceAll("'", "''")}' AND a.platform='INSTAGRAM'`)).trim());
  assert.deepEqual(library.items.map((item) => item.id).sort(), expectedReels);
  assert.equal((await http("/reels", { token })).status, 200);
  assert.equal((await http("/painel", { token })).status, 200);
  assert.equal((await http("/automacoes/nova", { token })).status, 200);
  // Escritas apenas na cópia descartável: persistir/reabrir mensagens e seleção.
  const selected = library.items.slice(0, 2).map((item) => item.id);
  const draft = { name: "Teste Docker: ação 🌊 漢字", scope: selected.length ? "SPECIFIC_REELS" : "GLOBAL", reelIds: selected, keywords: [], steps: [{ kind: "SEND_DM", format: "TEXT", text: "Rascunho incompleto 🌊", buttons: [] }], publicReplies: { enabled: false, strategy: "ROTATING", variations: ["", "", "", "", ""], fallback: { enabled: false, text: "" } } };
  const createdDraft = await http("/api/automacoes", { token, method: "POST", body: draft });
  assert.equal(createdDraft.status, 201);
  const automation = JSON.parse(createdDraft.body);
  assert.equal(automation.status, "DRAFT");
  assert.deepEqual(automation.reels.map((reel) => reel.instagramReelId).sort(), selected.toSorted());
  const message = "Mensagem editada: acentuação, 🌊 e 漢字";
  const edit = await http(`/api/automacoes/${automation.id}`, { token, method: "PATCH", body: { ...draft, steps: [{ ...draft.steps[0], text: message }] } });
  assert.equal(edit.status, 200);
  const reopened = await http(`/api/automacoes/${automation.id}`, { token });
  assert.equal(reopened.status, 200);
  const saved = JSON.parse(reopened.body);
  assert.equal(saved.steps[0].text, message);
  assert.deepEqual(saved.reels.map((reel) => reel.instagramReelId).sort(), selected.toSorted());
  assert.equal((await http(`/api/automacoes/${automation.id}`, { token, method: "DELETE", body: {} })).status, 204);
  const create = await http("/api/tags", { token, method: "POST", body: { name: "Docker: ação, 🌊 漢字" } });
  assert.equal(create.status, 201, safe(create.body));
  const tag = JSON.parse(create.body);
  assert.equal((await http(`/api/tags/${tag.id}`, { token, method: "DELETE", body: {} })).status, 204);
  if (dump) assert.deepEqual(await fingerprint(), original);
  console.log("Docker: HTTPS, assets, sessão, Prisma, Reels, rascunhos e escrita Unicode passaram");
  const web = await inspect("web");
  assert.equal(web.Config.User, "pulso");
  assert.equal(web.HostConfig.ReadonlyRootfs, true);
  assert.ok(web.HostConfig.Memory <= 1536 * 1024 * 1024);
  assert.ok(!web.Config.Env.some((v) => /^INSTAGRAM_ACCESS_TOKEN=.+/.test(v)));
  const worker = await inspect("worker");
  assert.equal(worker.HostConfig.RestartPolicy.Name, "unless-stopped");
  assert.ok(!worker.Mounts.some((v) => v.Destination.includes("instagram")));
  const health = JSON.parse(await compose("exec", "-T", "worker", "node", "-e", "console.log(require('fs').readFileSync('/tmp/pulso-worker-health.json','utf8'))"));
  assert.equal(health.mode, "standby"); assert.equal(health.executionEnabled, false);
  await compose("exec", "-T", "worker", "node", "-e", "const fs=require('fs');for(const p of fs.readdirSync('/proc').filter(v=>/^\\d+$/.test(v))){try{if(fs.readFileSync('/proc/'+p+'/cmdline','utf8').split('\\0')[1]==='ops/runtime/worker.mjs')process.kill(Number(p),'SIGKILL')}catch{}} ");
  await wait(async () => (await inspect("worker")).RestartCount > worker.RestartCount, "reinício automático do worker");
  await healthy("worker");
  await compose("restart", "postgres");
  await healthy("postgres"); await healthy("web");
  if (dump) assert.deepEqual(await fingerprint(), original);
  console.log("Docker: limites, worker em espera, reinício automático e persistência passaram");
  await compose("--profile", "backup", "run", "--rm", "backup", "init");
  await compose("--profile", "backup", "up", "-d", "backup");
  await healthy("backup");
  assert.equal((await inspect("backup")).HostConfig.RestartPolicy.Name, "unless-stopped");
  await compose("--profile", "backup", "stop", "backup");
  console.log("Docker: serviço de backup agendado iniciou e concluiu seu primeiro backup");
  await compose("--profile", "backup", "run", "--rm", "backup", "once");
  await compose("--profile", "backup", "run", "--rm", "backup", "check");
  restoredContainer = `${project}-restore`;
  await compose("--profile", "backup", "run", "--name", restoredContainer, "-d", "--entrypoint", "bash", "backup", "-c", "/usr/local/bin/pulso-backup restore && touch /tmp/restore-ok && sleep 300");
  await wait(async () => { try { await run(["exec", restoredContainer, "test", "-f", "/tmp/restore-ok"]); return true; } catch { return false; } }, "restauração Restic");
  const recovered = join(directory, "recovered.dump");
  // docker cp não acessa tmpfs: exportar privadamente pelo processo ativo.
  writeFileSync(recovered, Buffer.from(await run(["exec", restoredContainer, "base64", "-w0", "/tmp/recovery/tmp/pulso.dump"]), "base64"), { mode: 0o600 });
  const manifest = join(directory, "recovered.sha256");
  writeFileSync(manifest, await run(["exec", restoredContainer, "cat", "/tmp/recovery/tmp/pulso.dump.sha256"]), { mode: 0o600 });
  assert.equal(createHash("sha256").update(readFileSync(recovered)).digest("hex"), readFileSync(manifest, "utf8").split(" ")[0]);
  await compose("cp", linuxPath(recovered), "postgres:/tmp/recovered.dump");
  await compose("exec", "-T", "postgres", "createdb", "-U", "pulso", "-T", "template0", "-E", "UTF8", "pulso_test_recovery");
  await compose("exec", "-T", "postgres", "pg_restore", "-U", "pulso", "-d", "pulso_test_recovery", "--no-owner", "--no-acl", "--exit-on-error", "--single-transaction", "/tmp/recovered.dump");
  assert.deepEqual(await fingerprint("pulso_test_recovery"), await fingerprint());
  console.log("Docker: backup criptografado e recuperação integral passaram (repositório local de teste)");
  const logs = await compose("logs", "--no-color");
  for (const value of sensitive) assert.equal(logs.includes(value), false, "credencial não deve aparecer nos logs");
  const images = JSON.parse(await run(["image", "inspect", "pulso:production", "pulso:tools", "pulso:backup"]));
  console.log(JSON.stringify({ project, encoding: "UTF8", reels: Number((await sql('SELECT count(*) FROM "InstagramReel"')).trim()), automations: Number((await sql('SELECT count(*) FROM "Automation"')).trim()), owners: Number((await sql('SELECT count(*) FROM "User"')).trim()), imageMB: images.map((image) => ({ name: image.RepoTags[0], size: Math.round(image.Size / 1024 / 1024) })) }));
} catch (error) {
  console.error(safe(error.message));
  try { console.error(safe(await compose("logs", "--tail", "30", "--no-color"))); } catch {}
  process.exitCode = 1;
} finally {
  // Apenas este projeto aleatório: nunca executar down -v no compose de desenvolvimento.
  if (restoredContainer) await run(["rm", "-f", restoredContainer]).catch(() => {});
  assert.match(project, /^pulso-test-[a-f0-9]{10}$/);
  await compose("--profile", "backup", "down", "--volumes", "--remove-orphans").catch(() => { process.exitCode = 1; });
  assert.match(relative(resolve(tmpdir()), resolve(directory)), /^pulso-docker-test-[^/\\]+$/);
  rmSync(directory, { recursive: true, force: true });
}
