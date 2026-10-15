import { createDatabaseClient } from "../src/lib/db";
import { graphId } from "../src/lib/instagram/execution/config";

// Inicializa somente metadados técnicos de uma base NOVA de recepção; nunca o proprietário.
// Não lê .env, não recebe token/App Secret e não chama a Meta.
const safeCodes = new Set([
  "RECEPTION_CONFIGURATION_REQUIRED",
  "DATABASE_NOT_ISOLATED",
  "EXISTING_DATA_REFUSED",
]);
const client = createDatabaseClient(
  process.env.DATABASE_URL ?? "postgresql://localhost:1/invalid",
  1,
);
async function main() {
  const initialize = process.argv.includes("--initialize");
  if (
    process.argv.length !== 3 ||
    (!initialize && !process.argv.includes("--check")) ||
    process.env.PULSO_WEBHOOK_RECEPTION_ONLY !== "true" ||
    process.env.INSTAGRAM_SEND_MODE !== "disabled" ||
    !graphId(process.env.INSTAGRAM_EXECUTION_ACCOUNT_ID)
  )
    throw Error("RECEPTION_CONFIGURATION_REQUIRED");
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    decodeURIComponent(url.pathname) !== "/pulso_webhook_test"
  )
    throw Error("DATABASE_NOT_ISOLATED");
  const [database] = await client.$queryRaw<
    { name: string; encoding: string }[]
  >`SELECT current_database() AS name, current_setting('server_encoding') AS encoding`;
  if (database.name !== "pulso_webhook_test" || database.encoding !== "UTF8")
    throw Error("DATABASE_NOT_ISOLATED");
  const initialized = await client.$transaction(async (tx) => {
    if (initialize)
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('pulso:webhook-reception-setup'))::text`;
    const [users, automations, reels, workspaces, accounts] = await Promise.all(
      [
        tx.user.count(),
        tx.automation.count(),
        tx.instagramReel.count(),
        tx.workspace.findMany(),
        tx.socialAccount.findMany(),
      ],
    );
    if (
      users ||
      automations ||
      reels ||
      workspaces.length > 1 ||
      accounts.length > 1
    )
      throw Error("EXISTING_DATA_REFUSED");
    if (
      workspaces.length === 1 &&
      accounts.length === 1 &&
      accounts[0].workspaceId === workspaces[0].id &&
      accounts[0].platform === "INSTAGRAM" &&
      accounts[0].externalId === process.env.INSTAGRAM_EXECUTION_ACCOUNT_ID &&
      accounts[0].status === "NOT_CONNECTED"
    )
      return false;
    if (workspaces.length || accounts.length || !initialize)
      throw Error("EXISTING_DATA_REFUSED");
    const workspace = await tx.workspace.create({
      data: { name: "Recepção controlada de webhooks" },
    });
    await tx.socialAccount.create({
      data: {
        workspaceId: workspace.id,
        platform: "INSTAGRAM",
        externalId: process.env.INSTAGRAM_EXECUTION_ACCOUNT_ID,
        status: "NOT_CONNECTED",
      },
    });
    return true;
  });
  console.log(
    JSON.stringify({
      ready: true,
      initialized,
      receiverOnly: true,
      sendsEnabled: false,
      ownerCreated: false,
      sourceDataCopied: false,
    }),
  );
}
main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        ready: false,
        code:
          error instanceof Error && safeCodes.has(error.message)
            ? error.message
            : "RECEPTION_SETUP_FAILED",
      }),
    );
    process.exitCode = 1;
  })
  .finally(() => client.$disconnect());
