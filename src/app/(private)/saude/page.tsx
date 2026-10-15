import type { Metadata } from "next";
import {
  Activity,
  Bell,
  Clock3,
  Camera as Instagram,
  ListOrdered,
  Radio,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Badge, EmptyState, PageHeading } from "@/components/ui";
import Link from "next/link";
import { requireOwner } from "@/lib/session";
import { db } from "@/lib/db";
import {
  executionSettings,
  executionConfigured,
} from "@/lib/instagram/execution/config";
import {
  executionOverview,
  listActivities,
} from "@/lib/instagram/execution/activity";

export const metadata: Metadata = { title: "Saúde do sistema" };
const services = [
  {
    name: "Conexão Instagram",
    icon: Instagram,
    status: "Verificação no painel",
    description:
      "O painel mostra o resultado atual da consulta de leitura ao perfil.",
  },
  {
    name: "Webhooks",
    icon: Radio,
    status: "Não configurado",
    description: "Recebimento de eventos e comentários.",
  },
  {
    name: "Filas de processamento",
    icon: ListOrdered,
    status: "Não configurado",
    description: "Organização e execução das automações.",
  },
];
export default async function HealthPage() {
  const { workspace } = await requireOwner();
  const [overview, activities] = await Promise.all([
    executionOverview(db, workspace.id),
    listActivities(db, workspace.id),
  ]);
  const settings = executionSettings(),
    enabled = executionConfigured(settings);
  const healthy = overview.workers.some((worker) => worker.online);
  const statuses = [
    "Verificação no painel",
    settings.webhookEnabled &&
    settings.appSecret.length >= 16 &&
    settings.verifyToken.length >= 32
      ? "Recebimento habilitado"
      : "Recebimento bloqueado",
    !overview.installed
      ? "Atualização do banco pendente"
      : enabled
        ? `${overview.queued} tarefa(s) pendente(s)`
        : "Envios bloqueados",
  ];
  return (
    <>
      <PageHeading
        eyebrow="GERENCIAMENTO"
        title="Saúde do sistema"
        description="Um lugar para acompanhar a operação e entender o que precisa de atenção."
        action={
          <span className="stage-label">
            <Activity size={14} />{" "}
            {enabled ? "Execução habilitada" : "Envios bloqueados"}
          </span>
        }
      />
      <p className="data-caption">
        O fluxo está implementado; a validação real da Meta, a atualização
        autorizada do banco e a publicação continuam necessárias. A consulta de
        leitura não autoriza envios.
      </p>
      <section className="health-grid" aria-label="Estado dos serviços">
        {services.map(({ name, icon: Icon, description }, index) => (
          <article className="card service-card" key={name}>
            <span className="service-icon">
              <Icon size={23} strokeWidth={1.6} aria-hidden="true" />
            </span>
            <h2>{name}</h2>
            <p>{description}</p>
            <Badge>{statuses[index]}</Badge>
          </article>
        ))}
      </section>
      <div className="verification-strip">
        <Clock3 size={19} aria-hidden="true" />
        <div>
          <strong>Monitoramento contínuo</strong>
          <p>
            {healthy
              ? "Heartbeat recente do worker."
              : "Nenhum worker confirmou execução recente."}
          </p>
        </div>
        <span className="muted">{healthy ? "Disponível" : "Aguardando"}</span>
      </div>
      <section className="card">
        <div className="section-heading">
          <h2>Histórico de falhas</h2>
          <Link href="/atividades" className="text-link">
            Ver atividades
          </Link>
        </div>
        {!activities.outbounds.length && !activities.queueFailures.length ? (
          <EmptyState
            icon={ShieldCheck}
            title="Nenhuma falha registrada"
            description="Os registros reais de execução aparecerão aqui depois da autorização."
          />
        ) : (
          activities.outbounds.map((item) => (
            <p key={item.id} className="form-error">
              {item.run.automation?.name ?? "Automação removida"}:{" "}
              {item.status === "UNKNOWN"
                ? "Resultado não confirmado; revisão necessária."
                : "Envio recusado pela Meta."}
            </p>
          ))
        )}
        {activities.queueFailures.map((item) => (
          <p key={item.id} className="form-error">
            Falha de processamento: {item.lastError}
          </p>
        ))}
      </section>
      <div className="settings-grid health-settings">
        <section className="card settings-card">
          <div className="settings-title">
            <Bell size={19} aria-hidden="true" />
            <h2>Alertas</h2>
            <span className="notice-label">Em breve</span>
          </div>
          <p>
            Receba avisos sobre falhas e interrupções quando o monitoramento
            estiver disponível.
          </p>
        </section>
        <section className="card settings-card">
          <div className="settings-title">
            <TriangleAlert size={19} aria-hidden="true" />
            <h2>Reconexão</h2>
            <span className="notice-label">Em breve</span>
          </div>
          <p>
            Permissões expiradas e etapas de reconexão serão apresentadas aqui.
          </p>
        </section>
      </div>
    </>
  );
}
