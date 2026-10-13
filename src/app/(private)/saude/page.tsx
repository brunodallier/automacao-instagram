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
import { Badge, EmptyState, FutureNotice, PageHeading } from "@/components/ui";

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
export default function HealthPage() {
  return (
    <>
      <PageHeading
        eyebrow="GERENCIAMENTO"
        title="Saúde do sistema"
        description="Um lugar para acompanhar a operação e entender o que precisa de atenção."
        action={
          <span className="stage-label">
            <Activity size={14} /> Monitoramento em preparação
          </span>
        }
      />
      <FutureNotice>
        A verificação de leitura do Instagram está no painel. Monitoramento
        contínuo, webhooks e filas ainda não foram habilitados.
      </FutureNotice>
      <section className="health-grid" aria-label="Estado dos serviços">
        {services.map(({ name, icon: Icon, status, description }) => (
          <article className="card service-card" key={name}>
            <span className="service-icon">
              <Icon size={23} strokeWidth={1.6} aria-hidden="true" />
            </span>
            <h2>{name}</h2>
            <p>{description}</p>
            <Badge>{status}</Badge>
          </article>
        ))}
      </section>
      <div className="verification-strip">
        <Clock3 size={19} aria-hidden="true" />
        <div>
          <strong>Monitoramento contínuo</strong>
          <p>Não iniciado; a consulta de leitura é exibida no painel.</p>
        </div>
        <span className="muted">—</span>
      </div>
      <section className="card">
        <div className="section-heading">
          <h2>Histórico de falhas</h2>
          <span className="count-label">Sem registros</span>
        </div>
        <EmptyState
          icon={ShieldCheck}
          title="Nenhuma falha registrada"
          description="Quando o processamento estiver disponível, eventuais falhas e tentativas de recuperação aparecerão aqui."
        />
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
