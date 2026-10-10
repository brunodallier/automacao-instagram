import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Circle,
  Camera as Instagram,
  MessageSquare,
  Send,
  ShieldAlert,
  Workflow,
  Tag,
  Settings2,
} from "lucide-react";
import { Badge, EmptyState, PageHeading } from "@/components/ui";
import { requireOwner } from "@/lib/session";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Painel principal" };
const metrics = [
  {
    label: "Automações ativas",
    icon: Workflow,
    description: "Prontas para conversar",
  },
  {
    label: "Comentários identificados",
    icon: MessageSquare,
    description: "Pelas suas palavras-chave",
  },
  {
    label: "DMs aceitas pela API",
    icon: Send,
    description: "Aceite de envio pela Meta",
  },
  {
    label: "Falhas registradas",
    icon: ShieldAlert,
    description: "Execuções que precisam de atenção",
  },
];

export default async function Dashboard() {
  const { workspace } = await requireOwner();
  const tagCount = await db.tag.count({ where: { workspaceId: workspace.id } });
  return (
    <>
      <div className="dashboard-overview">
        <div className="dashboard-intro">
          <PageHeading
            eyebrow="VISÃO GERAL"
            title="Painel principal"
            description="Uma visão clara do seu espaço. No ritmo do seu negócio."
          />
          <div className="welcome-strip">
            <div>
              <div>
                <span className="stage-label">
                  <span /> Integração em preparação
                </span>
                <h2>O próximo passo começa com organização.</h2>
                <p>
                  Prepare suas tags e desenhe suas conversas. A conexão com o
                  Instagram vem depois.
                </p>
              </div>
            </div>
            <Link href="/tags" className="button button-primary">
              Criar minha primeira tag{" "}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </div>
        <section className="metric-grid" aria-label="Métricas de automação">
          {metrics.map(({ label, icon: Icon, description }) => (
            <div className="metric-card" key={label}>
              <div className="metric-top">
                <span>{label}</span>
                <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
              </div>
              <strong className="metric-value">0</strong>
              <p>{description}</p>
            </div>
          ))}
        </section>
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="card connection-card">
            <div className="section-heading">
              <div className="section-heading-icon">
                <Instagram size={21} aria-hidden="true" />
                <h2>Conexão Instagram</h2>
              </div>
              <Badge>Não conectado</Badge>
            </div>
            <div className="connection-content">
              <span className="connection-symbol">
                <Instagram size={31} strokeWidth={1.4} aria-hidden="true" />
              </span>
              <div>
                <h3>Sua conta, conectada ao seu espaço.</h3>
                <p>
                  A conexão com sua conta Business será disponibilizada em uma
                  próxima etapa.
                </p>
              </div>
            </div>
            <div className="card-bottom">
              <span>Integração oficial da Meta</span>
              <Link href="/configuracoes">
                Ver configurações <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </section>
          <section className="card recent-card">
            <div className="section-heading">
              <h2>Automações recentes</h2>
              <Link href="/automacoes" className="text-link">
                Ver todas <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
            <EmptyState
              icon={Workflow}
              title="Cada conversa começa com uma ideia."
              description="Crie e organize seus rascunhos na área de automações."
            />
            <div className="recent-table-labels" aria-hidden="true">
              <span>Nome da automação</span>
              <span>Status</span>
              <span>Última execução</span>
            </div>
          </section>
        </div>
        <aside className="card getting-started">
          <div className="section-heading">
            <h2>Primeiros passos</h2>
            <span className="step-count">{tagCount > 0 ? "2" : "1"}/3</span>
          </div>
          <p className="section-description">
            Prepare a casa para suas automações.
          </p>
          <ol className="checklist">
            <li className="complete">
              <span className="checklist-dot">
                <Check size={14} />
              </span>
              <div>
                <h3>Seu espaço criado</h3>
                <p>Acesso privado e seguro.</p>
              </div>
            </li>
            <li className={tagCount > 0 ? "complete" : "current"}>
              <span className="checklist-dot">
                {tagCount > 0 ? <Check size={14} /> : <Tag size={14} />}
              </span>
              <div>
                <h3>Organize suas tags</h3>
                <p>
                  {tagCount > 0
                    ? `${tagCount} ${tagCount === 1 ? "tag cadastrada" : "tags cadastradas"}. Tudo organizado.`
                    : "Crie os marcadores do seu negócio."}
                </p>
                <Link href="/tags">
                  Gerenciar tags <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </div>
            </li>
            <li>
              <span className="checklist-dot">
                <Circle size={12} />
              </span>
              <div>
                <h3>Conecte o Instagram</h3>
                <p>Disponível em uma próxima etapa.</p>
              </div>
            </li>
          </ol>
          <div className="getting-started-note">
            <Settings2 size={17} aria-hidden="true" />
            <p>
              Você define o ritmo.
              <br />
              Comece pela organização.
            </p>
          </div>
        </aside>
      </div>
      <p className="data-caption">
        As métricas permanecem zeradas enquanto a integração e o motor de
        automações não estão disponíveis.
      </p>
    </>
  );
}
