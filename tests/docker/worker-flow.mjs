// Executa o worker empacotado e o endpoint Next.js contra Graph HTTPS SIMULADO.
// A rede interna não tem saída para a internet; graph.instagram.com é um alias do mock.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, relative } from "node:path";
import { randomBytes, createHmac } from "node:crypto";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { encode } from "next-auth/jwt";
const root = resolve("."),
  directory = mkdtempSync(join(tmpdir(), "pulso-worker-flow-")),
  project = `pulso-worker-flow-${randomBytes(5).toString("hex")}`;
const accountId = "17841000123456789",
  commentId = "18000000000001",
  mediaId = "18000000000002",
  recipientId = "18000000000003";
const password = randomBytes(32).toString("hex"),
  session = randomBytes(32).toString("hex"),
  appSecret = randomBytes(32).toString("hex"),
  verify = randomBytes(32).toString("hex"),
  token = `fixture-not-meta-${randomBytes(16).toString("hex")}`;
const sensitive = [password, session, appSecret, verify, token],
  redact = (value) =>
    sensitive.reduce(
      (text, secret) => text.replaceAll(secret, "[fixture-redacted]"),
      value,
    );
async function docker(args, stdin = "") {
  return new Promise((ok, fail) => {
    const p = spawn("docker", args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    for (const pipe of [p.stdout, p.stderr])
      pipe.on("data", (v) => {
        out += v;
      });
    p.on("error", fail);
    p.on("exit", (code) =>
      code === 0 ? ok(out) : fail(new Error(redact(out))),
    );
    p.stdin.on("error", () => {});
    p.stdin.end(stdin);
  });
}
async function freePort() {
  const server = createServer();
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const port = server.address().port;
  await new Promise((ok) => server.close(ok));
  return port;
}
const port = await freePort(),
  origin = `http://localhost:${port}`,
  env = join(directory, "test.env"),
  override = join(directory, "override.json"),
  caFile = join(directory, "root.crt");
writeFileSync(caFile, "");
writeFileSync(
  env,
  `PULSO_DOMAIN=localhost\nPULSO_PUBLIC_URL=${origin}\nPULSO_DB_NAME=pulso_worker_test\nPULSO_DB_USER=pulso\nINSTAGRAM_SEND_MODE=controlled\nINSTAGRAM_WEBHOOK_ENABLED=true\nINSTAGRAM_META_VALIDATED=false\nINSTAGRAM_EXECUTION_ACCOUNT_ID=${accountId}\nINSTAGRAM_TEST_COMMENT_ID=${commentId}\nINSTAGRAM_TEST_RECIPIENT_ID=${recipientId}\nRESTIC_REPOSITORY=\n`,
  { mode: 0o600 },
);
const secrets = {};
for (const [name, value] of Object.entries({
  postgres_password: password,
  database_url: `postgresql://pulso:${password}@postgres:5432/pulso_worker_test`,
  nextauth_secret: session,
  instagram_token: token,
  instagram_app_secret: appSecret,
  instagram_webhook_verify_token: verify,
  restic_password: "",
  s3_access_key: "",
  s3_secret_key: "",
})) {
  const file = join(directory, name);
  writeFileSync(file, value, { mode: 0o444 });
  secrets[name] = { file };
}
const mock = join(directory, "mock.mjs");
writeFileSync(
  mock,
  `import http from 'node:http';let ledger=[];const account='${accountId}',recipient='${recipientId}',comment='${commentId}';http.createServer(async(req,res)=>{const url=new URL(req.url,'http://mock');res.setHeader('Content-Type','application/json');if(url.pathname==='/ledger'){res.end(JSON.stringify(ledger));return;}if(url.pathname==='/v25.0/me'){res.end(JSON.stringify({user_id:account,username:'fixtureowner'}));return;}if(url.pathname==='/v25.0/'+comment&&req.method==='GET'){res.end(JSON.stringify({id:comment,text:'teste',timestamp:new Date(Date.now()-60000).toISOString()}));return;}if(req.method==='POST'){let body='';for await(const part of req)body+=part;const data=JSON.parse(body);ledger.push({path:url.pathname,body:data});if(url.pathname.endsWith('/replies'))res.end(JSON.stringify({id:String(1800001000+ledger.length)}));else res.end(JSON.stringify({recipient_id:recipient,message_id:'fixture-mid-'+ledger.length}));return;}res.writeHead(404);res.end('{}');}).listen(8080,'0.0.0.0');`,
);
const caddy = join(directory, "Graph.Caddyfile");
writeFileSync(
  caddy,
  "https://graph.instagram.com {\n tls internal\n reverse_proxy mock:8080\n}\n",
);
const mounts = [`${caFile}:/fixture/root.crt:ro`];
writeFileSync(
  override,
  JSON.stringify({
    secrets,
    networks: { application: { internal: true } },
    services: {
      web: {
        ports: [
          { target: 3000, published: String(port), host_ip: "127.0.0.1" },
        ],
        environment: { NODE_EXTRA_CA_CERTS: "/fixture/root.crt" },
        volumes: mounts,
      },
      worker: {
        environment: { NODE_EXTRA_CA_CERTS: "/fixture/root.crt" },
        volumes: mounts,
      },
      caddy: { profiles: ["unused-gateway"] },
      mock: {
        image: "node:24-bookworm-slim",
        user: "10001:10001",
        command: ["node", "/fixture/mock.mjs"],
        volumes: [`${mock}:/fixture/mock.mjs:ro`],
        networks: ["application"],
        mem_limit: "128m",
        security_opt: ["no-new-privileges:true"],
        cap_drop: ["ALL"],
      },
      meta_proxy: {
        image: "caddy:2.11.2-alpine",
        volumes: [`${caddy}:/etc/caddy/Caddyfile:ro`],
        networks: { application: { aliases: ["graph.instagram.com"] } },
        mem_limit: "128m",
        depends_on: ["mock"],
        healthcheck: {
          test: [
            "CMD",
            "wget",
            "--spider",
            "-q",
            "http://127.0.0.1:2019/config/",
          ],
          interval: "2s",
          timeout: "3s",
          retries: 30,
        },
      },
    },
  }),
);
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
    override,
  ],
  compose = (...args) => docker([...base, ...args]);
async function inspect(service) {
  return JSON.parse(
    await docker([
      "inspect",
      (await compose("ps", "-a", "-q", service)).trim(),
    ]),
  )[0];
}
async function wait(fn, label, timeout = 120000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await fn()) return;
    await delay(1000);
  }
  throw Error(`Timeout: ${label}`);
}
const healthy = (service) =>
  wait(
    async () => (await inspect(service)).State.Health?.Status === "healthy",
    service,
  );
async function others() {
  const ids = (await docker(["ps", "-aq"])).trim().split(/\s+/).filter(Boolean);
  if (!ids.length) return [];
  return JSON.parse(await docker(["inspect", ...ids]))
    .filter((v) => v.Config.Labels?.["com.docker.compose.project"] !== project)
    .map((v) => ({
      id: v.Id,
      started: v.State.StartedAt,
      restarts: v.RestartCount,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
const before = await others();
const sql = (statement) =>
  compose(
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "pulso",
    "-d",
    "pulso_worker_test",
    "-At",
    "-c",
    statement,
  );
async function ledger() {
  return JSON.parse(
    await compose(
      "exec",
      "-T",
      "web",
      "node",
      "-e",
      "fetch('http://mock:8080/ledger').then(r=>r.text()).then(console.log)",
    ),
  );
}
async function webhook(payload, bad = false) {
  const raw = JSON.stringify(payload),
    sig = "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");
  const code =
    "const fs=require('fs');const input=JSON.parse(fs.readFileSync(0,'utf8'));fetch('http://127.0.0.1:3000/api/webhooks/instagram',{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':input.sig},body:input.raw}).then(async r=>console.log(JSON.stringify({status:r.status,body:await r.text()})));";
  return JSON.parse(
    await docker(
      [...base, "exec", "-T", "web", "node", "-e", code],
      JSON.stringify({ raw, sig: bad ? "sha256=" + "0".repeat(64) : sig }),
    ),
  );
}
const commentEvent = () => ({
  object: "instagram",
  entry: [
    {
      id: accountId,
      time: Math.floor(Date.now() / 1000),
      field: "comments",
      value: {
        id: commentId,
        from: { id: recipientId },
        text: "teste",
        media: { id: mediaId, media_product_type: "REELS" },
      },
    },
  ],
});
const inbound = (data) => ({
  object: "instagram",
  entry: [
    {
      id: accountId,
      time: Math.floor(Date.now() / 1000),
      messaging: [
        {
          sender: { id: recipientId },
          recipient: { id: accountId },
          timestamp: Date.now(),
          ...data,
        },
      ],
    },
  ],
});
try {
  console.log("Docker worker: build da aplicação e do motor empacotado");
  await compose("build", "web", "migrate");
  await compose("up", "-d", "postgres", "mock", "meta_proxy");
  await healthy("postgres");
  await healthy("meta_proxy");
  await compose(
    "cp",
    "meta_proxy:/data/caddy/pki/authorities/local/root.crt",
    caFile,
  );
  assert.ok(readFileSync(caFile).length);
  await compose("up", "-d", "web", "worker");
  await healthy("web");
  await healthy("worker");
  const setup =
    "import {configureFirstOwner} from './src/lib/bootstrap-owner.ts';import {createDatabaseClient} from './src/lib/db.ts';const db=createDatabaseClient(process.env.DATABASE_URL!);(async()=>{const owner=await configureFirstOwner(db,{name:'Teste Worker',email:'worker@example.invalid',password:'Aa1!123456',workspaceName:'Teste Worker'});const ws=owner.memberships[0].workspaceId;await db.socialAccount.create({data:{workspaceId:ws,platform:'INSTAGRAM',externalId:'" +
    accountId +
    "',status:'CONNECTED'}});await db.instagramReel.create({data:{socialAccountId:(await db.socialAccount.findFirstOrThrow()).id,externalId:'" +
    mediaId +
    "',mediaType:'VIDEO',mediaProductType:'REELS',classification:'PRODUCT_TYPE',publishedAt:new Date(Date.now()-86400000),syncedAt:new Date()}});await db.$disconnect();console.log(JSON.stringify({ownerId:owner.id,workspaceId:ws}));})()";
  const owner = JSON.parse(
    (
      await compose(
        "run",
        "--rm",
        "-T",
        "tools",
        "node",
        "node_modules/tsx/dist/cli.mjs",
        "-e",
        setup,
      )
    )
      .trim()
      .split("\n")
      .at(-1),
  );
  await wait(
    async () =>
      Number(
        (await sql('SELECT count(*) FROM "InstagramWorkerState"')).trim(),
      ) === 1,
    "heartbeat de execução",
  );
  const activate =
    "import {readFileSync} from 'node:fs';import {createDatabaseClient} from './src/lib/db.ts';import {automationService} from './src/lib/automations.ts';const input=JSON.parse(readFileSync(0,'utf8'));const db=createDatabaseClient(process.env.DATABASE_URL!);(async()=>{const tag=await db.tag.create({data:{workspaceId:input.ws,name:'Lead',normalizedName:'lead'}});const service=automationService(db,input.settings);const auto=await service.create(input.ws,{name:'Teste controlado do worker',scope:'GLOBAL',keywords:['teste'],publicReplies:{enabled:true,strategy:'ROTATING',variations:['Comentário recebido','','','',''],fallback:{enabled:false,text:''}},steps:[{kind:'ADD_TAG',tagId:tag.id},{kind:'DELAY',delaySeconds:1},{kind:'SEND_DM',text:'Olá 🌊',buttons:[]},{kind:'SEND_DM',text:'Escolha',buttons:[{label:'Site',action:'OPEN_URL',url:'https://example.invalid',nextMessage:null},{label:'Continuar',action:'NEXT_MESSAGE',url:'',nextMessage:{format:'TEXT',text:'Continuação 🌊',buttons:[]}}]}]});await service.activate(input.ws,auto.id);await db.$disconnect();})()";
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
      activate,
    ],
    JSON.stringify({
      ws: owner.workspaceId,
      settings: {
        mode: "controlled",
        accountId,
        webhookEnabled: true,
        appSecret,
        verifyToken: verify,
        testCommentId: commentId,
        testRecipientId: recipientId,
        metaValidated: false,
      },
    }),
  );
  assert.equal((await webhook(commentEvent(), true)).status, 401);
  assert.equal((await webhook(commentEvent())).status, 200);
  await wait(
    async () => (await ledger()).length === 2,
    "resposta privada e pública simuladas",
  );
  assert.equal(
    (await sql('SELECT count(*) FROM "InstagramContactTag"')).trim(),
    "1",
  );
  const first = await ledger();
  assert.match(first[0].path, /\/messages$/);
  assert.deepEqual(first[0].body.recipient, { comment_id: commentId });
  assert.equal(first[0].body.message.text, "Olá 🌊");
  assert.match(first[1].path, /\/replies$/);
  await webhook(commentEvent());
  await webhook(inbound({ referral: { ref: "URL_CLICK" } }));
  await delay(2000);
  assert.equal((await ledger()).length, 2);
  await webhook(
    inbound({ message: { mid: "fixture-inbound-1", text: "Continuar" } }),
  );
  await wait(async () => (await ledger()).length === 3, "template de botões");
  const template = (await ledger())[2].body.message.attachment.payload;
  assert.equal(template.template_type, "button");
  assert.equal(template.buttons[0].type, "web_url");
  assert.equal(template.buttons[1].type, "postback");
  const click = inbound({
    postback: {
      mid: "fixture-postback-1",
      payload: template.buttons[1].payload,
    },
  });
  await webhook(click);
  await webhook(click);
  await wait(
    async () => (await ledger()).length === 4,
    "continuação por postback",
  );
  assert.equal((await ledger())[3].body.message.text, "Continuação 🌊");
  await wait(
    async () =>
      (await sql('SELECT state FROM "InstagramAutomationRun"')).trim() ===
      "COMPLETED",
    "conclusão da sequência",
  );
  const jwt = await encode({
    secret: session,
    maxAge: 3600,
    token: {
      sub: owner.ownerId,
      sessionVersion: 0,
      authenticatedAt: Date.now(),
    },
  });
  sensitive.push(jwt);
  const ownerRequest = async (path) => {
    const script =
      "const fs=require('fs');const input=JSON.parse(fs.readFileSync(0,'utf8'));fetch('http://127.0.0.1:3000'+input.path,{headers:{Cookie:input.cookie}}).then(async r=>console.log(JSON.stringify({status:r.status,body:await r.text()})));";
    return JSON.parse(
      await docker(
        [...base, "exec", "-T", "web", "node", "-e", script],
        JSON.stringify({ path, cookie: `next-auth.session-token=${jwt}` }),
      ),
    );
  };
  const activities = await ownerRequest("/api/atividades");
  assert.equal(activities.status, 200);
  const history = activities.body;
  assert.ok(JSON.parse(history).items.length > 0);
  for (const value of sensitive) assert.equal(history.includes(value), false);
  const privatePage = await ownerRequest("/atividades");
  assert.equal(privatePage.status, 200);
  assert.match(privatePage.body, /Aceito pela API/);
  for (const service of ["postgres", "worker", "mock", "meta_proxy"])
    assert.equal(
      Object.keys((await inspect(service)).HostConfig.PortBindings ?? {})
        .length,
      0,
    );
  const worker = await inspect("worker");
  const network = Object.keys(worker.NetworkSettings.Networks)[0];
  assert.equal(
    JSON.parse(await docker(["network", "inspect", network]))[0].Internal,
    true,
  );
  const logs = await compose("logs", "--no-color");
  for (const value of sensitive)
    assert.equal(logs.includes(value), false, "Credencial nos logs de teste");
  console.log(
    "Worker Docker passou: Next webhook assinado → PostgreSQL → worker real → HTTPS Graph simulado → DM/público → resposta elegível → botões → continuação, sem duplicatas ou internet.",
  );
} catch (error) {
  console.error(redact(error.message));
  try {
    console.error(redact(await compose("logs", "--no-color", "--tail", "15")));
  } catch {}
  process.exitCode = 1;
} finally {
  assert.match(project, /^pulso-worker-flow-[a-f0-9]{10}$/);
  await compose("down", "--volumes", "--remove-orphans");
  assert.deepEqual(await others(), before, "Outro projeto foi alterado");
  assert.match(
    relative(resolve(tmpdir()), resolve(directory)),
    /^pulso-worker-flow-[^/\\]+$/,
  );
  rmSync(directory, { recursive: true, force: true });
}
