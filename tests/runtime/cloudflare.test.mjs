import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { buildTunnelConfiguration, validateAccessState, validateTunnelCredentials } from "../../ops/cloudflare/config.mjs";
const hostname = "pulso.example.com";
const ownerEmail = "owner@example.com";
const audience = "a".repeat(64);
const state = () => ({ hostname, ownerEmail, app: { type: "self_hosted", domain: hostname, aud: audience, allowed_idps: ["otp-only"] }, policies: [{ decision: "allow", include: [{ email: { email: ownerEmail } }] }], identityProviders: [{ id: "otp-only", type: "onetimepin" }] });
test("Access permite somente o proprietário e somente OTP", () => {
  assert.equal(validateAccessState(state()).audience, audience);
  for (const mutate of [
    s => { s.policies[0].include = [{ everyone: {} }]; },
    s => { s.policies[0].include.push({ email: { email: "other@example.com" } }); },
    s => { s.policies[0].decision = "bypass"; },
    s => { s.policies.push({ decision: "allow", include: [{ everyone: {} }] }); },
    s => { s.app.domain = "*.example.com"; },
    s => { s.app.domain += "/login"; },
    s => { s.app.allowed_idps = []; },
    s => { s.app.allowed_idps.push("another-idp"); },
    s => { s.identityProviders[0].type = "google"; },
    s => { s.app.allow_authenticate_via_warp = true; },
  ]) {
    const value = state(); mutate(value);
    assert.throws(() => validateAccessState(value), /inválida/);
  }
});
test("Tunnel exige JWT e nega saúde, webhooks e demais hostnames", () => {
  const config = buildTunnelConfiguration({ hostname, teamName: "test-team", tunnelId: randomUUID(), audience });
  assert.deepEqual(config.ingress[1].originRequest.access, { required: true, teamName: "test-team", audTag: [audience] });
  const blocked = new RegExp(config.ingress[0].path);
  for (const path of ["/api/health/ready", "/api/webhooks", "/api/webhooks/meta", "/webhooks/meta"]) assert.ok(blocked.test(path));
  assert.equal(blocked.test("/login"), false);
  assert.equal(config.ingress.at(-1).service, "http_status:404");
  assert.equal(config.ingress[1].service, "http://caddy:8080");
  assert.throws(() => buildTunnelConfiguration({ hostname: "*.example.com", teamName: "test", tunnelId: randomUUID(), audience }), /inválida/);
});
test("credenciais precisam pertencer ao Tunnel e à conta escolhidos, sem revelar o segredo", () => {
  const tunnelId = randomUUID(), accountId = "b".repeat(32), secret = randomBytes(32).toString("base64");
  const credentials = { TunnelID: tunnelId, AccountTag: accountId, TunnelSecret: secret };
  validateTunnelCredentials(credentials, tunnelId, accountId);
  assert.throws(() => validateTunnelCredentials(credentials, randomUUID(), accountId), error => !error.message.includes(secret));
  assert.throws(() => validateTunnelCredentials({ ...credentials, TunnelSecret: "short" }, tunnelId, accountId), /inválida/);
});
test("geração offline não publica saída para política insegura nem sobrescreve arquivos existentes", () => {
  const directory = mkdtempSync(join(tmpdir(), "pulso-config-test-"));
  const input = join(directory, "state.json"), output = join(directory, "generated");
  const tunnelId = randomUUID(), accountId = "b".repeat(32), secret = randomBytes(32).toString("base64");
  const value = { ...state(), teamName: "test-team", tunnelId, accountId, credentials: { TunnelID: tunnelId, AccountTag: accountId, TunnelSecret: secret } };
  const run = () => spawnSync(process.execPath, ["ops/cloudflare/prepare.mjs", input, output], { encoding: "utf8", windowsHide: true });
  try {
    writeFileSync(input, JSON.stringify({ ...value, policies: [{ decision: "bypass", include: [{ everyone: {} }] }] }), { mode: 0o600 });
    const denied = run(); assert.equal(denied.status, 1); assert.equal(existsSync(output), false); assert.equal(denied.stderr.includes(secret), false);
    writeFileSync(input, JSON.stringify(value));
    const created = run(); assert.equal(created.status, 0); assert.equal(created.stdout.includes(secret), false);
    const config = readFileSync(join(output, "config.json"), "utf8");
    assert.equal(config.includes(secret), false); assert.equal(JSON.parse(config).ingress[1].originRequest.access.required, true);
    assert.equal(run().status, 1); assert.equal(readFileSync(join(output, "config.json"), "utf8"), config);
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep) && basename(directory).startsWith("pulso-config-test-"));
    rmSync(directory, { recursive: true, force: true });
  }
});
