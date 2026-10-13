import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRuntimeSecrets } from "../../ops/runtime/secrets.mjs";

test("carrega segredos apenas em runtime, sem modificar o ambiente recebido", () => {
  const env = { DATABASE_URL_FILE: "/private/db", NEXTAUTH_SECRET_FILE: "/private/auth", INSTAGRAM_ACCESS_TOKEN_FILE: "/private/instagram", PORT: "3000" };
  const files = { "/private/db": "postgresql://test-only\n", "/private/auth": "a".repeat(32), "/private/instagram": "" };
  const result = loadRuntimeSecrets(env, (path) => files[path]);
  assert.equal(result.DATABASE_URL, "postgresql://test-only");
  assert.equal(result.NEXTAUTH_SECRET.length, 32);
  assert.equal(result.INSTAGRAM_ACCESS_TOKEN, "");
  assert.equal(result.PORT, "3000");
  assert.equal(env.DATABASE_URL, undefined);
});

test("recusa credenciais ambíguas, ausentes e segredo de sessão curto", () => {
  assert.throws(() => loadRuntimeSecrets({ DATABASE_URL: "test-only", DATABASE_URL_FILE: "/private/db" }), /ambígua/);
  assert.throws(() => loadRuntimeSecrets({ DATABASE_URL_FILE: "/private/db" }, () => ""), /ausente/);
  assert.throws(() => loadRuntimeSecrets({ NEXTAUTH_SECRET_FILE: "/private/auth" }, () => "short"), /inválido/);
});

test("não revela caminho nem erro privado de leitura", () => {
  assert.throws(() => loadRuntimeSecrets({ DATABASE_URL_FILE: "/private/db" }, () => { throw new Error("test-private-details"); }), (error) => {
    assert.equal(error.message, "Não foi possível carregar a configuração privada.");
    assert.equal(error.message.includes("test-private-details"), false);
    assert.equal(error.message.includes("/private/db"), false);
    return true;
  });
});

test("continua aceitando o ambiente convencional fora dos containers", () => {
  const env = { DATABASE_URL: "test-only", INSTAGRAM_ACCESS_TOKEN: "", PORT: "3000" };
  assert.deepEqual(loadRuntimeSecrets(env), env);
});
