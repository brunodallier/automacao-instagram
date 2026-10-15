import type { Metadata } from "next";
import Link from "next/link";
import { Activity } from "lucide-react";
import { PageHeading, EmptyState, Badge } from "@/components/ui";
import { FallbackReview } from "@/components/fallback-review";
import { requireOwner } from "@/lib/session";
import { db } from "@/lib/db";
import {
  listActivities,
  activityLabels,
  executionStateLabels,
} from "@/lib/instagram/execution/activity";
import { idSchema } from "@/lib/validation";
export const metadata: Metadata = { title: "Atividades" };
const date = (value: Date) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Sao_Paulo",
  }).format(value);
export default async function Activities({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { workspace } = await requireOwner(),
    query = await searchParams;
  const result = await listActivities(
    db,
    workspace.id,
    query.cursor && idSchema.safeParse(query.cursor).success
      ? query.cursor
      : undefined,
  );
  return (
    <>
      <PageHeading
        eyebrow="GERENCIAMENTO"
        title="Atividades"
        description="Comentários, mensagens e estados reais de cada execução."
      />
      <p className="data-caption">
        Aceito pela API significa que a Meta aceitou a solicitação. Entrega ou
        leitura só são informadas quando há um evento correspondente.
      </p>
      {!result.installed ? (
        <p role="status" className="form-error">
          A atualização do banco de execuções ainda não foi aplicada neste
          ambiente. Seus rascunhos continuam preservados.
        </p>
      ) : null}
      <section className="card">
        <div className="section-heading">
          <h2>Histórico</h2>
          <Link href="/atividades" className="text-link">
            Atualizar
          </Link>
        </div>
        {!result.items.length ? (
          <EmptyState
            icon={Activity}
            title="Nenhuma atividade registrada"
            description="Os eventos aparecerão aqui depois que o recebimento e a execução forem autorizados."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <caption className="sr-only">
                Histórico de atividades de automações
              </caption>
              <thead>
                <tr>
                  <th scope="col">Horário</th>
                  <th scope="col">Automação</th>
                  <th scope="col">Atividade</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item) => (
                  <tr key={item.id}>
                    <td className="muted">{date(item.createdAt)}</td>
                    <td>
                      {item.run.automation?.name ?? "Automação removida"}
                      <small className="muted">
                        {" "}
                        · Comentário {item.run.commentId}
                      </small>
                    </td>
                    <td>
                      {activityLabels[item.kind] ?? item.kind}
                      {item.detail ? (
                        <small className="muted"> · {item.detail}</small>
                      ) : null}
                    </td>
                    <td>
                      <Badge>
                        {executionStateLabels[item.run.state] ?? item.run.state}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result.nextCursor ? (
          <Link
            className="button button-secondary"
            href={`/atividades?cursor=${encodeURIComponent(result.nextCursor)}`}
          >
            Próximos registros
          </Link>
        ) : null}
      </section>
      {result.outbounds.length ? (
        <section className="card">
          <div className="section-heading">
            <h2>Envios que precisam de atenção</h2>
          </div>
          <p className="muted">
            Resultados não confirmados ficam em revisão e não são reenviados
            automaticamente. A alternativa só é permitida após erro definitivo
            identificado e justificado.
          </p>
          {result.outbounds.map((item) => (
            <article key={item.id} className="verification-strip">
              <div>
                <strong>
                  {item.run.automation?.name ?? "Automação removida"}
                </strong>
                <p>
                  {item.status === "UNKNOWN"
                    ? "Resultado não confirmado"
                    : "Envio recusado"}{" "}
                  · {item.errorCategory}{" "}
                  {item.errorCode !== null
                    ? `(${item.errorCode}${item.errorSubcode !== null ? `/${item.errorSubcode}` : ""})`
                    : ""}
                </p>
                <small className="muted">
                  {date(item.createdAt)} · Comentário {item.run.commentId}
                </small>
              </div>
              {item.kind === "PRIVATE_REPLY" &&
              item.status === "REJECTED" &&
              item.errorCategory === "META_REJECTED" ? (
                <FallbackReview outboundId={item.id} />
              ) : null}
            </article>
          ))}
        </section>
      ) : null}
      {result.queueFailures.length ? (
        <section className="card">
          <h2>Falhas no recebimento/processamento</h2>
          {result.queueFailures.map((item) => (
            <p key={item.id}>
              {date(item.createdAt)} ·{" "}
              {item.lastError ?? "Falha de processamento"}
            </p>
          ))}
        </section>
      ) : null}
    </>
  );
}
