import type { PrismaClient } from "@/generated/prisma/client";
import { executionTablesInstalled } from "./readiness";
export const executionStateLabels: Record<string, string> = {
  RUNNING: "Em andamento",
  WAITING_INTERACTION: "Aguardando resposta",
  WAITING_POSTBACK: "Aguardando botão",
  COMPLETED: "Concluída",
  FAILED: "Erro identificado",
  REVIEW: "Revisão necessária",
  CANCELLED: "Cancelada",
};
export const activityLabels: Record<string, string> = {
  COMMENT_MATCHED: "Comentário identificado",
  MESSAGE_QUEUED: "Mensagem na fila",
  PUBLIC_REPLY_QUEUED: "Resposta pública na fila",
  API_ACCEPTED: "Aceito pela API",
  SEND_REJECTED: "Envio recusado",
  SEND_UNCONFIRMED: "Resultado não confirmado",
  MESSAGE_SEEN: "Leitura informada pela Meta",
  INBOUND_MESSAGE: "Resposta recebida",
  POSTBACK_ACCEPTED: "Botão acionado",
  WAITING_INTERACTION: "Aguardando interação",
  DELAY_SCHEDULED: "Atraso agendado",
  TAG_PENDING: "Tag aguardando destinatário",
  TAG_ASSIGNED: "Tag aplicada",
  RATE_LIMIT_RETRY: "Limite da API: nova tentativa agendada",
  WINDOW_EXPIRED: "Janela de mensagens encerrada",
  PRIVATE_REPLY_EXPIRED: "Prazo da resposta privada encerrado",
  SEQUENCE_COMPLETED: "Sequência concluída",
  CANCELLED: "Execução cancelada",
  EXECUTION_FAILED: "Falha no processamento",
  FALLBACK_APPROVED: "Alternativa pública justificada pelo proprietário",
  VERIFICATION_RETRY: "Verificação de conta: nova tentativa agendada",
};
export async function executionOverview(
  client: PrismaClient,
  workspaceId: string,
) {
  const installed = await executionTablesInstalled(client);
  const active = await client.automation.count({
    where: { workspaceId, status: "ACTIVE" },
  });
  if (!installed)
    return {
      installed,
      active,
      comments: null,
      accepted: null,
      failures: null,
      queued: null,
      workers: [],
    };
  const [comments, accepted, failures, queued, workers] = await Promise.all([
    client.instagramAutomationRun.count({ where: { workspaceId } }),
    client.instagramOutbound.count({
      where: {
        run: { workspaceId },
        status: "API_ACCEPTED",
        kind: { in: ["PRIVATE_REPLY", "DM"] },
      },
    }),
    client.instagramJob.count({
      where: { socialAccount: { workspaceId }, state: "DEAD" },
    }),
    client.instagramJob.count({
      where: {
        socialAccount: { workspaceId },
        state: { in: ["READY", "RETRY", "RUNNING"] },
      },
    }),
    client.instagramWorkerState.findMany({
      where: { socialAccount: { workspaceId } },
      select: {
        heartbeatAt: true,
        mode: true,
        socialAccount: { select: { username: true, status: true } },
      },
    }),
  ]);
  const checkedAt = Date.now();
  return {
    installed,
    active,
    comments,
    accepted,
    failures,
    queued,
    workers: workers.map((worker) => ({
      ...worker,
      online:
        checkedAt - worker.heartbeatAt.getTime() < 45000 &&
        worker.heartbeatAt.getTime() <= checkedAt &&
        worker.socialAccount.status === "CONNECTED",
    })),
  };
}
export async function listActivities(
  client: PrismaClient,
  workspaceId: string,
  cursor?: string,
) {
  if (!(await executionTablesInstalled(client)))
    return {
      installed: false,
      items: [],
      nextCursor: null,
      outbounds: [],
      queueFailures: [],
    };
  const [items, outbounds, queueFailures] = await Promise.all([
    client.instagramActivity.findMany({
      where: { run: { workspaceId } },
      take: 51,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        kind: true,
        detail: true,
        createdAt: true,
        run: {
          select: {
            id: true,
            state: true,
            commentId: true,
            automation: { select: { name: true } },
          },
        },
      },
    }),
    client.instagramOutbound.findMany({
      where: { run: { workspaceId }, status: { in: ["REJECTED", "UNKNOWN"] } },
      take: 50,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        kind: true,
        status: true,
        errorCategory: true,
        errorCode: true,
        errorSubcode: true,
        createdAt: true,
        run: {
          select: {
            state: true,
            commentId: true,
            automation: { select: { name: true } },
          },
        },
      },
    }),
    client.instagramJob.findMany({
      where: { socialAccount: { workspaceId }, state: "DEAD", runId: null },
      take: 20,
      orderBy: { createdAt: "desc" },
      select: { id: true, kind: true, lastError: true, createdAt: true },
    }),
  ]);
  return {
    installed: true,
    items: items.slice(0, 50),
    nextCursor: items.length > 50 ? items[49].id : null,
    outbounds,
    queueFailures,
  };
}
