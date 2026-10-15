import "dotenv/config";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import {
  testDatabaseUrl,
  migrateTestDatabase,
} from "../tests/helpers/database";

try {
  const url = testDatabaseUrl();
  migrateTestDatabase(url);
  const child = spawn(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: url,
        NEXTAUTH_URL: "http://localhost:3100",
        NEXTAUTH_SECRET: randomBytes(32).toString("base64url"),
        E2E_PASSWORD: randomBytes(24).toString("base64url"),
        // Tests must never contact Meta with the installation's real credential.
        INSTAGRAM_ACCESS_TOKEN: "",
        INSTAGRAM_ACCESS_TOKEN_FILE: "",
        INSTAGRAM_SEND_MODE: "disabled",
        INSTAGRAM_META_VALIDATED: "false",
        INSTAGRAM_WEBHOOK_ENABLED: "false",
        INSTAGRAM_APP_SECRET: "",
        INSTAGRAM_APP_SECRET_FILE: "",
        INSTAGRAM_WEBHOOK_VERIFY_TOKEN: "",
        INSTAGRAM_WEBHOOK_VERIFY_TOKEN_FILE: "",
        INSTAGRAM_EXECUTION_ACCOUNT_ID: "",
        INSTAGRAM_TEST_COMMENT_ID: "",
        INSTAGRAM_TEST_RECIPIENT_ID: "",
      },
    },
  );
  child.on("error", () => {
    console.error("Não foi possível iniciar os testes de navegador.");
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Configure o banco de testes.",
  );
  process.exitCode = 1;
}
