import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createDatabaseClient } from "../../src/lib/db";

export function testDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value)
    throw new Error(
      "Configure TEST_DATABASE_URL com um PostgreSQL separado para executar estes testes.",
    );
  const url = new URL(value);
  if (
    !["postgresql:", "postgres:"].includes(url.protocol) ||
    !url.pathname.toLowerCase().includes("test")
  )
    throw new Error(
      "O banco de testes deve ser PostgreSQL e ter 'test' no nome.",
    );
  if (process.env.DATABASE_URL) {
    const appUrl = new URL(process.env.DATABASE_URL);
    const host = (url: URL) =>
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        ? "loopback"
        : url.hostname;
    if (
      host(url) === host(appUrl) &&
      (url.port || "5432") === (appUrl.port || "5432") &&
      decodeURIComponent(url.pathname) === decodeURIComponent(appUrl.pathname)
    ) {
      throw new Error(
        "O banco de testes não pode ser o banco da aplicação, mesmo com credenciais ou parâmetros diferentes.",
      );
    }
  }
  return value;
}

export function migrateTestDatabase(url: string) {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    },
  );
}

export function testClient() {
  const url = testDatabaseUrl();
  migrateTestDatabase(url);
  return createDatabaseClient(url);
}

export function fixtureName() {
  return `teste-${randomUUID()}`;
}
