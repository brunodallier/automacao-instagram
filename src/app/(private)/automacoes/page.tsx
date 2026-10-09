import type { Metadata } from "next";
import { ArrowRight, Info, Plus, Workflow } from "lucide-react";
import Link from "next/link";
import { EmptyState, FutureNotice, PageHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Automações" };
export default function AutomationsPage() {
  return (
    <>
      <PageHeading
        eyebrow="ORGANIZAÇÃO"
        title="Automações"
        description="Transforme comentários em conversas. Suas automações ficarão reunidas aqui."
        action={
          <button
            className="button button-primary"
            disabled
            title="O editor será desenvolvido na Etapa 2"
          >
            <Plus size={17} /> Nova automação
          </button>
        }
      />
      <FutureNotice>
        O editor simplificado por etapas será desenvolvido na Etapa 2. Criação,
        edição, duplicação, pausa e exclusão ainda não estão disponíveis.
      </FutureNotice>
      <section className="card automation-list">
        <div className="section-heading">
          <h2>Suas automações</h2>
          <span className="count-label">0 automações</span>
        </div>
        <div className="table-scroll">
          <table>
            <caption className="sr-only">
              Estrutura da futura listagem de automações
            </caption>
            <thead>
              <tr>
                {[
                  "Nome",
                  "Status",
                  "Escopo",
                  "Criação",
                  "Última execução",
                  "Ações",
                ].map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={Workflow}
                    title="Tudo pronto para sua primeira automação"
                    description="Em breve, configure palavras-chave, mensagens e próximos passos em um editor simples."
                  >
                    <Link href="/tags" className="button button-secondary">
                      Começar pelas tags{" "}
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </EmptyState>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <div className="automation-info">
        <div className="info-block">
          <Info size={20} aria-hidden="true" />
          <div>
            <h3>Uma regra para manter tudo organizado</h3>
            <p>
              Automações específicas de um Reel terão prioridade sobre
              automações globais.
            </p>
          </div>
        </div>
        <div className="scope-guide">
          <div>
            <span className="tiny-label">STATUS PREVISTOS</span>
            <p>Rascunho · Ativa · Pausada · Erro</p>
          </div>
          <div>
            <span className="tiny-label">ESCOPO PREVISTO</span>
            <p>Global · Reels futuros · Reels específicos</p>
          </div>
        </div>
      </div>
    </>
  );
}
