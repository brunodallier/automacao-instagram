import type { PrismaClient } from "@/generated/prisma/client";
import { executionConfigured, type ExecutionSettings } from "./config";
export async function executionTablesInstalled(client: PrismaClient) {
  const result = await client.$queryRaw<
    { installed: boolean }[]
  >`SELECT to_regclass('public."InstagramJob"') IS NOT NULL AND to_regclass('public."InstagramAutomationRun"') IS NOT NULL AS installed`;
  return result[0]?.installed === true;
}
export async function executionReadiness(
  client: PrismaClient,
  workspaceId: string,
  settings: ExecutionSettings,
  now = new Date(),
) {
  if (!executionConfigured(settings))
    return {
      ready: false,
      reason:
        "Os envios reais estão bloqueados. A integração com o Instagram exige configuração, autorização e validação controlada antes da ativação.",
    };
  if (settings.appSecret.length < 16 || settings.verifyToken.length < 32)
    return {
      ready: false,
      reason: "A verificação segura dos webhooks ainda não está configurada.",
    };
  if (!(await executionTablesInstalled(client)))
    return {
      ready: false,
      reason:
        "A atualização aditiva do banco ainda não foi aplicada neste ambiente.",
    };
  const accounts = await client.socialAccount.findMany({
    where: { platform: "INSTAGRAM", externalId: settings.accountId },
    include: { workerState: true },
  });
  if (
    accounts.length !== 1 ||
    accounts[0].workspaceId !== workspaceId ||
    accounts[0].status !== "CONNECTED"
  )
    return {
      ready: false,
      reason: "A conta autorizada não está conectada a este espaço.",
    };
  const account = accounts[0];
  if (
    !account.workerState ||
    account.workerState.mode !== settings.mode ||
    now.getTime() - account.workerState.heartbeatAt.getTime() > 45000 ||
    account.workerState.heartbeatAt > now
  )
    return {
      ready: false,
      reason:
        "O worker não confirmou disponibilidade recente. Verifique a Saúde do sistema.",
    };
  return { ready: true, reason: "", accountId: account.id };
}
